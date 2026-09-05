-- Audit duration must include database application, not only source fetch time.
CREATE OR REPLACE FUNCTION public.apply_ingest_snapshot(run_id uuid, jobs_payload jsonb, source_results jsonb, snapshot_checksum text, duration_ms integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '55s'
AS $function$
declare
  source_result jsonb;
  job_payload jsonb;
  source_name text;
  external_key text;
  selected_job_id uuid;
  candidate_job_id uuid;
  is_new boolean;
  previous_count integer;
  previous_rejection numeric;
  rejection numeric;
  quarantine text;
  source_succeeded boolean;
  source_complete boolean;
  source_schema_valid boolean;
  source_markers_present boolean;
  source_raw_count integer;
  source_parsed_count integer;
  source_accepted_count integer;
  source_rejected_count integer;
  source_duration_ms integer;
  payload_count integer;
  payloads_valid boolean;
  invalid_source_result boolean;
  drop_threshold numeric;
  rejection_delta numeric;
  maximum_rejection numeric;
  max_age integer;
  inserted_total integer := 0;
  updated_total integer := 0;
  deactivated_total integer := 0;
  healthy_total integer := 0;
  quarantined_total integer := 0;
  raw_total integer := 0;
  parsed_total integer := 0;
  accepted_total integer := 0;
  rejected_total integer := 0;
begin
  if jsonb_typeof(jobs_payload) is distinct from 'array'
    or jsonb_typeof(source_results) is distinct from 'array' then
    raise exception 'jobs_payload and source_results must be arrays';
  end if;

  if coalesce(snapshot_checksum, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'snapshot_checksum must be a lowercase SHA-256 digest';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(source_results) as element(value)
    where jsonb_typeof(element.value) is distinct from 'object'
      or nullif(btrim(element.value->>'source'), '') is null
      or length(btrim(element.value->>'source')) > 64
  ) then
    raise exception 'every source result requires a valid source identifier';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(source_results) as element(value)
    group by btrim(element.value->>'source')
    having count(*) > 1
  ) then
    raise exception 'duplicate source results are not allowed';
  end if;

  if not pg_try_advisory_xact_lock(hashtext('timley:apply-ingest-snapshot')) then
    raise exception 'ingest snapshot application is locked';
  end if;

  if not exists (
    select 1
    from app_meta.ingest_lease as lease
    where lease.singleton and lease.run_id = apply_ingest_snapshot.run_id
      and lease.lease_expires_at > now()
  ) then
    raise exception 'ingest lease is missing or expired';
  end if;

  select settings.accepted_drop_threshold,
         settings.rejection_rate_delta,
         settings.maximum_rejection_rate,
         settings.max_posting_age_days
  into drop_threshold, rejection_delta, maximum_rejection, max_age
  from app_meta.ingest_settings as settings
  where settings.singleton;

  if drop_threshold is null
    or rejection_delta is null
    or maximum_rejection is null
    or max_age is null
  then
    raise exception 'ingest settings are not configured';
  end if;

  delete from app_meta.ingest_previous_jobs as previous
  where previous.run_id = apply_ingest_snapshot.run_id;
  delete from app_meta.ingest_touched_jobs as touched
  where touched.run_id = apply_ingest_snapshot.run_id;
  delete from app_meta.ingest_healthy_sources as healthy
  where healthy.run_id = apply_ingest_snapshot.run_id;

  for source_result in select value from jsonb_array_elements(source_results)
  loop
    source_name := btrim(source_result->>'source');
    source_succeeded := app_meta.try_boolean(source_result->>'succeeded');
    source_complete := app_meta.try_boolean(source_result->>'complete_snapshot');
    source_schema_valid := app_meta.try_boolean(source_result->>'schema_valid');
    source_markers_present := app_meta.try_boolean(source_result->>'markers_present');
    source_raw_count := app_meta.try_integer(source_result->>'raw_fetched');
    source_parsed_count := app_meta.try_integer(source_result->>'parsed');
    source_accepted_count := app_meta.try_integer(source_result->>'accepted');
    source_rejected_count := app_meta.try_integer(source_result->>'rejected');
    source_duration_ms := app_meta.try_integer(source_result->>'duration_ms');

    invalid_source_result := source_succeeded is null
      or (source_result ? 'complete_snapshot' and source_complete is null)
      or source_schema_valid is null
      or source_markers_present is null
      or source_raw_count is null
      or source_parsed_count is null
      or source_accepted_count is null
      or source_rejected_count is null
      or source_raw_count < 0
      or source_parsed_count < 0
      or source_accepted_count < 0
      or source_rejected_count < 0
      or source_accepted_count > source_parsed_count
      or source_rejected_count > source_raw_count
      or source_parsed_count > source_raw_count
      or (source_duration_ms is not null and source_duration_ms < 0)
      or (
        coalesce(source_succeeded, false)
        and (
          nullif(btrim(source_result->>'parser_version'), '') is null
          or length(btrim(source_result->>'parser_version')) > 128
        )
      )
      or (
        coalesce(source_succeeded, false)
        and coalesce(source_result->>'snapshot_checksum', '') !~ '^[a-f0-9]{64}$'
      );

    source_raw_count := greatest(coalesce(source_raw_count, 0), 0);
    source_parsed_count := greatest(coalesce(source_parsed_count, 0), 0);
    source_accepted_count := greatest(coalesce(source_accepted_count, 0), 0);
    source_rejected_count := greatest(coalesce(source_rejected_count, 0), 0);
    source_duration_ms := greatest(coalesce(source_duration_ms, 0), 0);

    select count(*)::integer,
           coalesce(bool_and(app_meta.ingest_job_payload_is_valid(element.value)), false)
    into payload_count, payloads_valid
    from jsonb_array_elements(jobs_payload) as element(value)
    where element.value->>'source' = source_name;

    select previous.accepted_count, previous.rejection_rate
    into previous_count, previous_rejection
    from public.ingest_source_runs as previous
    where previous.source = source_name
      -- Ratio baselines are meaningful only within the same parser behavior.
      -- Absolute schema, marker, zero-result, and rejection guards still apply
      -- to the first healthy run of a new parser version.
      and previous.parser_version = btrim(source_result->>'parser_version')
      and previous.succeeded
      and not previous.quarantined
      and previous.accepted_count > 0
    order by previous.ran_at desc
    limit 1;

    rejection := case
      when source_parsed_count = 0 then 0
      else least(
        1,
        greatest(
          0,
          source_rejected_count::numeric
          / greatest(source_parsed_count::numeric, 1)
        )
      )
    end;

    quarantine := null;
    if invalid_source_result then
      quarantine := 'invalid_source_result';
    elsif not source_succeeded then
      quarantine := 'source_failed';
    elsif not coalesce(source_complete, false) then
      quarantine := 'partial_snapshot';
    elsif source_accepted_count = 0 then
      quarantine := 'zero_accepted';
    elsif not source_schema_valid then
      quarantine := 'schema_invalid';
    elsif not source_markers_present then
      quarantine := 'expected_markers_missing';
    elsif rejection > maximum_rejection then
      quarantine := 'rejection_rate_high';
    elsif payload_count <> source_accepted_count then
      quarantine := 'accepted_payload_mismatch';
    elsif not payloads_valid then
      quarantine := 'invalid_payload';
    elsif previous_count is not null
      and source_accepted_count < floor(previous_count * (1 - drop_threshold)) then
      quarantine := 'accepted_count_drop';
    elsif previous_rejection is not null
      and abs(rejection - previous_rejection) > rejection_delta then
      quarantine := 'rejection_rate_change';
    end if;

    insert into public.ingest_source_runs (
      run_id, source, succeeded, complete_snapshot, fetched_count,
      raw_fetched_count, parsed_count, accepted_count, rejected_count,
      schema_valid, expected_markers_present, quarantined,
      quarantine_reason, previous_healthy_count, rejection_rate,
      snapshot_checksum, parser_version, duration_ms, error, ran_at
    ) values (
      apply_ingest_snapshot.run_id,
      source_name,
      coalesce(source_succeeded, false),
      quarantine is null,
      source_raw_count,
      source_raw_count,
      source_parsed_count,
      source_accepted_count,
      source_rejected_count,
      coalesce(source_schema_valid, false),
      coalesce(source_markers_present, false),
      quarantine is not null,
      quarantine,
      previous_count,
      rejection,
      source_result->>'snapshot_checksum',
      source_result->>'parser_version',
      source_duration_ms,
      left(nullif(source_result->>'error', ''), 4000),
      now()
    )
    on conflict on constraint ingest_source_runs_run_source_unique do update set
      succeeded = excluded.succeeded,
      complete_snapshot = excluded.complete_snapshot,
      fetched_count = excluded.fetched_count,
      raw_fetched_count = excluded.raw_fetched_count,
      parsed_count = excluded.parsed_count,
      accepted_count = excluded.accepted_count,
      rejected_count = excluded.rejected_count,
      schema_valid = excluded.schema_valid,
      expected_markers_present = excluded.expected_markers_present,
      quarantined = excluded.quarantined,
      quarantine_reason = excluded.quarantine_reason,
      previous_healthy_count = excluded.previous_healthy_count,
      rejection_rate = excluded.rejection_rate,
      snapshot_checksum = excluded.snapshot_checksum,
      parser_version = excluded.parser_version,
      duration_ms = excluded.duration_ms,
      error = excluded.error,
      ran_at = excluded.ran_at;

    raw_total := raw_total + source_raw_count;
    parsed_total := parsed_total + source_parsed_count;
    accepted_total := accepted_total + source_accepted_count;
    rejected_total := rejected_total + source_rejected_count;

    if quarantine is null then
      insert into app_meta.ingest_healthy_sources (
        run_id, source, parser_version, snapshot_checksum
      ) values (
        apply_ingest_snapshot.run_id,
        source_name,
        btrim(source_result->>'parser_version'),
        source_result->>'snapshot_checksum'
      )
      on conflict do nothing;
      healthy_total := healthy_total + 1;
    else
      quarantined_total := quarantined_total + 1;
    end if;
  end loop;

  if healthy_total = 0 then
    update public.ingest_runs as run
    set status = 'quarantined',
        snapshot_checksum = apply_ingest_snapshot.snapshot_checksum,
        raw_fetched_count = raw_total,
        parsed_count = parsed_total,
        accepted_count = accepted_total,
        rejected_count = rejected_total,
        duration_ms = greatest(0, (extract(epoch from (clock_timestamp() - run.started_at)) * 1000)::integer),
        monitoring = app_meta.build_ingest_monitoring(
          apply_ingest_snapshot.run_id,
          greatest(0, (extract(epoch from (clock_timestamp() - run.started_at)) * 1000)::integer)
        ),
        finished_at = clock_timestamp()
    where run.id = apply_ingest_snapshot.run_id;

    delete from app_meta.ingest_lease as lease
    where lease.singleton and lease.run_id = apply_ingest_snapshot.run_id;

    delete from app_meta.ingest_healthy_sources as healthy
    where healthy.run_id = apply_ingest_snapshot.run_id;

    return jsonb_build_object(
      'inserted', 0, 'updated', 0, 'deactivated', 0,
      'healthy_sources', 0, 'quarantined_sources', quarantined_total
    );
  end if;

  for job_payload in
    select element.value || jsonb_build_object(
      'parser_version', healthy.parser_version,
      'snapshot_checksum', healthy.snapshot_checksum
    )
    from jsonb_array_elements(jobs_payload) as element(value)
    join app_meta.ingest_healthy_sources as healthy
      on healthy.run_id = apply_ingest_snapshot.run_id
      and healthy.source = element.value->>'source'
  loop
    source_name := job_payload->>'source';
    external_key := coalesce(
      nullif(job_payload->>'external_id', ''),
      encode(
        extensions.digest(
          source_name || '|' || coalesce(job_payload->>'link', ''),
          'sha256'
        ),
        'hex'
      )
    );
    selected_job_id := null;
    is_new := false;

    select observation.job_id
    into selected_job_id
    from public.job_sources as observation
    where observation.source = source_name
      and observation.external_id = external_key;

    if selected_job_id is null then
      select observation.job_id
      into selected_job_id
      from public.job_sources as observation
      where observation.apply_url = job_payload->>'link'
      order by observation.last_seen_at desc
      limit 1;
    end if;

    if selected_job_id is null then
      insert into public.jobs (
        title, company, category, role_type, primary_source, season, term_keys, sponsorship,
        primary_apply_url, display_location, raw_location,
        country_code, region_code, city, metro_id, location_type,
        normalization_confidence, location_facets, search_text,
        major_ids, niche_ids,
        posted_date, sort_date, salary_raw, salary_currency,
        salary_minimum, salary_maximum, salary_cadence,
        annualized_salary_minimum, annualized_salary_maximum,
        salary_parse_confidence, salary_provenance, source_salary_sort_max,
        company_domain, company_domain_confidence,
        first_seen_at, last_seen_at, last_checked_at, is_active
      ) values (
        left(job_payload->>'title', 300),
        left(job_payload->>'company', 200),
        coalesce(nullif(job_payload->>'category', ''), 'other'),
        coalesce(nullif(job_payload->>'role_type', ''), 'internship'),
        source_name,
        nullif(job_payload->>'season', ''),
        coalesce(
          array(select jsonb_array_elements_text(job_payload->'term_keys')),
          '{}'::text[]
        ),
        nullif(job_payload->>'sponsorship', ''),
        job_payload->>'link',
        coalesce(job_payload->>'location', ''),
        coalesce(job_payload->>'raw_location', job_payload->>'location', ''),
        nullif(job_payload->>'country_code', ''),
        nullif(job_payload->>'region_code', ''),
        nullif(job_payload->>'city', ''),
        nullif(job_payload->>'metro_id', ''),
        coalesce(nullif(job_payload->>'location_type', ''), 'onsite'),
        coalesce(app_meta.try_numeric(job_payload->>'normalization_confidence'), 0),
        coalesce(
          array(select jsonb_array_elements_text(job_payload->'location_facets')),
          '{}'::text[]
        ),
        coalesce(job_payload->>'search_text', concat_ws(' ', job_payload->>'title', job_payload->>'company', job_payload->>'location')),
        case
          when jsonb_typeof(job_payload->'major_ids') = 'array'
          then array(select jsonb_array_elements_text(job_payload->'major_ids'))
          else array['all']
        end,
        case
          when jsonb_typeof(job_payload->'niche_ids') = 'array'
          then array(select jsonb_array_elements_text(job_payload->'niche_ids'))
          else array['all']
        end,
        app_meta.try_date(nullif(job_payload->>'posted_date', '')),
        coalesce(app_meta.try_date(nullif(job_payload->>'posted_date', '')), current_date),
        nullif(job_payload->>'salary_raw', ''),
        nullif(job_payload->>'salary_currency', ''),
        app_meta.try_numeric(nullif(job_payload->>'salary_minimum', '')),
        app_meta.try_numeric(nullif(job_payload->>'salary_maximum', '')),
        nullif(job_payload->>'salary_cadence', ''),
        app_meta.try_numeric(nullif(job_payload->>'annualized_salary_minimum', '')),
        app_meta.try_numeric(nullif(job_payload->>'annualized_salary_maximum', '')),
        app_meta.try_numeric(nullif(job_payload->>'salary_parse_confidence', '')),
        case
          when nullif(job_payload->>'salary_raw', '') is null then null
          else 'source-listed'
        end,
        case
          when coalesce(app_meta.try_numeric(job_payload->>'salary_parse_confidence'), 0) >= 0.8
            and coalesce(job_payload->>'salary_currency', 'USD') = 'USD'
          then app_meta.try_numeric(nullif(job_payload->>'annualized_salary_maximum', ''))
          else null
        end,
        nullif(job_payload->>'company_domain', ''),
        app_meta.try_numeric(nullif(job_payload->>'company_domain_confidence', '')),
        now(), now(), now(), true
      ) returning id into selected_job_id;
      inserted_total := inserted_total + 1;
      is_new := true;
    else
      insert into app_meta.ingest_previous_jobs (
        run_id, job_id, primary_apply_url, title, company, display_location,
        posted_date, term_keys, salary
      )
      select
        apply_ingest_snapshot.run_id,
        job.id,
        job.primary_apply_url,
        job.title,
        job.company,
        job.display_location,
        job.posted_date,
        job.term_keys,
        jsonb_build_object(
          'raw', job.salary_raw,
          'currency', job.salary_currency,
          'minimum', job.salary_minimum,
          'maximum', job.salary_maximum,
          'cadence', job.salary_cadence,
          'annualized_minimum', job.annualized_salary_minimum,
          'annualized_maximum', job.annualized_salary_maximum,
          'parse_confidence', job.salary_parse_confidence,
          'provenance', job.salary_provenance
        )
      from public.jobs as job
      where job.id = selected_job_id
      on conflict on constraint ingest_previous_jobs_pkey do nothing;

      update public.jobs as job
      set title = left(job_payload->>'title', 300),
          company = left(job_payload->>'company', 200),
          category = coalesce(nullif(job_payload->>'category', ''), job.category),
          role_type = coalesce(nullif(job_payload->>'role_type', ''), job.role_type),
          primary_source = source_name,
          season = coalesce(nullif(job_payload->>'season', ''), job.season),
          term_keys = coalesce(
            array(select jsonb_array_elements_text(job_payload->'term_keys')),
            '{}'::text[]
          ),
          sponsorship = coalesce(nullif(job_payload->>'sponsorship', ''), job.sponsorship),
          primary_apply_url = job_payload->>'link',
          -- Structured location is one atomic tuple from the selected source;
          -- never retain stale city/region fields from a previous observation.
          display_location = job_payload->>'location',
          raw_location = coalesce(job_payload->>'raw_location', job_payload->>'location'),
          country_code = nullif(job_payload->>'country_code', ''),
          region_code = nullif(job_payload->>'region_code', ''),
          city = nullif(job_payload->>'city', ''),
          metro_id = nullif(job_payload->>'metro_id', ''),
          location_type = coalesce(nullif(job_payload->>'location_type', ''), 'onsite'),
          normalization_confidence = coalesce(
            app_meta.try_numeric(job_payload->>'normalization_confidence'),
            0
          ),
          location_facets = case
            when jsonb_typeof(job_payload->'location_facets') = 'array'
            then array(select jsonb_array_elements_text(job_payload->'location_facets'))
            else '{}'::text[]
          end,
          search_text = coalesce(
            nullif(job_payload->>'search_text', ''),
            concat_ws(' ', job_payload->>'title', job_payload->>'company', job_payload->>'location')
          ),
          major_ids = case
            when jsonb_typeof(job_payload->'major_ids') = 'array'
            then array(select jsonb_array_elements_text(job_payload->'major_ids'))
            else job.major_ids
          end,
          niche_ids = case
            when jsonb_typeof(job_payload->'niche_ids') = 'array'
            then array(select jsonb_array_elements_text(job_payload->'niche_ids'))
            else job.niche_ids
          end,
          posted_date = case
            when nullif(job_payload->>'posted_date', '') is null then job.posted_date
            else greatest(
              job.posted_date,
              app_meta.try_date(job_payload->>'posted_date')
            )
          end,
          sort_date = case
            when nullif(job_payload->>'posted_date', '') is null then job.sort_date
            else greatest(
              job.sort_date,
              app_meta.try_date(job_payload->>'posted_date')
            )
          end,
          salary_raw = coalesce(nullif(job_payload->>'salary_raw', ''), job.salary_raw),
          salary_currency = coalesce(nullif(job_payload->>'salary_currency', ''), job.salary_currency),
          salary_minimum = coalesce(
            app_meta.try_numeric(nullif(job_payload->>'salary_minimum', '')),
            job.salary_minimum
          ),
          salary_maximum = coalesce(
            app_meta.try_numeric(nullif(job_payload->>'salary_maximum', '')),
            job.salary_maximum
          ),
          salary_cadence = coalesce(nullif(job_payload->>'salary_cadence', ''), job.salary_cadence),
          annualized_salary_minimum = coalesce(
            app_meta.try_numeric(nullif(job_payload->>'annualized_salary_minimum', '')),
            job.annualized_salary_minimum
          ),
          annualized_salary_maximum = coalesce(
            app_meta.try_numeric(nullif(job_payload->>'annualized_salary_maximum', '')),
            job.annualized_salary_maximum
          ),
          salary_parse_confidence = greatest(
            coalesce(job.salary_parse_confidence, 0),
            coalesce(
              app_meta.try_numeric(nullif(job_payload->>'salary_parse_confidence', '')),
              0
            )
          ),
          salary_provenance = case
            when nullif(job_payload->>'salary_raw', '') is null then job.salary_provenance
            else 'source-listed'
          end,
          source_salary_sort_max = case
            when coalesce(
              app_meta.try_numeric(nullif(job_payload->>'salary_parse_confidence', '')),
              0
            ) >= 0.8
              and coalesce(job_payload->>'salary_currency', 'USD') = 'USD'
            then greatest(
              job.source_salary_sort_max,
              app_meta.try_numeric(nullif(job_payload->>'annualized_salary_maximum', ''))
            )
            else job.source_salary_sort_max
          end,
          company_domain = case
            when coalesce(
              app_meta.try_numeric(nullif(job_payload->>'company_domain_confidence', '')),
              0
            ) >= 0.8
            then nullif(job_payload->>'company_domain', '')
            else job.company_domain
          end,
          company_domain_confidence = greatest(
            coalesce(job.company_domain_confidence, 0),
            coalesce(
              app_meta.try_numeric(nullif(job_payload->>'company_domain_confidence', '')),
              0
            )
          ),
          last_seen_at = now(),
          last_checked_at = now(),
          is_active = true,
          updated_at = now()
      where job.id = selected_job_id;
      updated_total := updated_total + 1;
    end if;

    insert into public.job_sources (
      job_id, source, external_id, source_url, apply_url, fuzzy_key,
      raw_title, raw_location, season, term_keys, requisition_id, posted_date,
      country_code, region_code, city, metro_id, location_type,
      normalization_confidence, salary_raw, salary_currency,
      salary_minimum, salary_maximum, salary_cadence,
      annualized_salary_minimum, annualized_salary_maximum,
      salary_parse_confidence, salary_provenance,
      first_seen_at, last_seen_at, last_checked_at, active,
      healthy_miss_count, last_seen_run_id, parser_version,
      snapshot_checksum, updated_at
    ) values (
      selected_job_id,
      source_name,
      external_key,
      nullif(job_payload->>'source_url', ''),
      job_payload->>'link',
      nullif(job_payload->>'dedupe_key', ''),
      job_payload->>'title',
      coalesce(job_payload->>'raw_location', job_payload->>'location', ''),
      nullif(job_payload->>'season', ''),
      coalesce(
        array(select jsonb_array_elements_text(job_payload->'term_keys')),
        '{}'::text[]
      ),
      nullif(job_payload->>'requisition_id', ''),
      app_meta.try_date(nullif(job_payload->>'posted_date', '')),
      nullif(job_payload->>'country_code', ''),
      nullif(job_payload->>'region_code', ''),
      nullif(job_payload->>'city', ''),
      nullif(job_payload->>'metro_id', ''),
      coalesce(nullif(job_payload->>'location_type', ''), 'onsite'),
      coalesce(app_meta.try_numeric(job_payload->>'normalization_confidence'), 0),
      nullif(job_payload->>'salary_raw', ''),
      nullif(job_payload->>'salary_currency', ''),
      app_meta.try_numeric(nullif(job_payload->>'salary_minimum', '')),
      app_meta.try_numeric(nullif(job_payload->>'salary_maximum', '')),
      nullif(job_payload->>'salary_cadence', ''),
      app_meta.try_numeric(nullif(job_payload->>'annualized_salary_minimum', '')),
      app_meta.try_numeric(nullif(job_payload->>'annualized_salary_maximum', '')),
      app_meta.try_numeric(nullif(job_payload->>'salary_parse_confidence', '')),
      case
        when nullif(job_payload->>'salary_raw', '') is null then null
        else 'source-listed'
      end,
      now(), now(), now(), true, 0,
      apply_ingest_snapshot.run_id,
      coalesce(job_payload->>'parser_version', 'unknown'),
      nullif(job_payload->>'snapshot_checksum', ''),
      now()
    )
    on conflict (source, external_id) do update set
      job_id = excluded.job_id,
      source_url = excluded.source_url,
      apply_url = excluded.apply_url,
      fuzzy_key = excluded.fuzzy_key,
      raw_title = excluded.raw_title,
      raw_location = excluded.raw_location,
      season = coalesce(excluded.season, public.job_sources.season),
      term_keys = excluded.term_keys,
      requisition_id = coalesce(excluded.requisition_id, public.job_sources.requisition_id),
      posted_date = case
        when excluded.posted_date is null then public.job_sources.posted_date
        else greatest(public.job_sources.posted_date, excluded.posted_date)
      end,
      country_code = excluded.country_code,
      region_code = excluded.region_code,
      city = excluded.city,
      metro_id = excluded.metro_id,
      location_type = excluded.location_type,
      normalization_confidence = excluded.normalization_confidence,
      salary_raw = excluded.salary_raw,
      salary_currency = excluded.salary_currency,
      salary_minimum = excluded.salary_minimum,
      salary_maximum = excluded.salary_maximum,
      salary_cadence = excluded.salary_cadence,
      annualized_salary_minimum = excluded.annualized_salary_minimum,
      annualized_salary_maximum = excluded.annualized_salary_maximum,
      salary_parse_confidence = excluded.salary_parse_confidence,
      salary_provenance = excluded.salary_provenance,
      last_seen_at = now(),
      last_checked_at = now(),
      active = true,
      healthy_miss_count = 0,
      last_seen_run_id = excluded.last_seen_run_id,
      parser_version = excluded.parser_version,
      snapshot_checksum = excluded.snapshot_checksum,
      updated_at = now();

    insert into app_meta.job_url_aliases (url_hash, job_id)
    values (
      encode(extensions.digest(job_payload->>'link', 'sha256'), 'hex'),
      selected_job_id
    )
    on conflict (url_hash) do update
    set job_id = excluded.job_id, last_seen_at = now();

    insert into app_meta.ingest_touched_jobs (run_id, job_id)
    values (apply_ingest_snapshot.run_id, selected_job_id)
    on conflict do nothing;

    if is_new and nullif(job_payload->>'dedupe_key', '') is not null then
      select observation.job_id
      into candidate_job_id
      from public.job_sources as observation
      where observation.fuzzy_key = job_payload->>'dedupe_key'
        and observation.job_id <> selected_job_id
      order by observation.last_seen_at desc
      limit 1;

      if candidate_job_id is not null then
        insert into public.job_match_candidates (
          left_job_id, right_job_id, confidence, reason
        ) values (
          least(selected_job_id, candidate_job_id),
          greatest(selected_job_id, candidate_job_id),
          0.70,
          'normalized company/title/location candidate'
        ) on conflict (left_job_id, right_job_id) do nothing;
      end if;
    end if;
  end loop;

  with missed as (
    update public.job_sources as observation
    set healthy_miss_count = least(observation.healthy_miss_count + 1, 2),
        active = observation.healthy_miss_count + 1 < 2,
        last_checked_at = now(),
        updated_at = now()
    from app_meta.ingest_healthy_sources as healthy
    where healthy.run_id = apply_ingest_snapshot.run_id
      and observation.source = healthy.source
      and observation.active
      and observation.last_seen_run_id is distinct from apply_ingest_snapshot.run_id
    returning observation.job_id
  )
  insert into app_meta.ingest_touched_jobs (run_id, job_id)
  select distinct apply_ingest_snapshot.run_id, missed.job_id from missed
  on conflict do nothing;

  with aged_out as (
    update public.job_sources as observation
    set active = false,
        last_checked_at = now(),
        updated_at = now()
    where observation.active
      and observation.posted_date is null
      and observation.first_seen_at < now() - make_interval(days => max_age)
    returning observation.job_id
  )
  insert into app_meta.ingest_touched_jobs (run_id, job_id)
  select distinct apply_ingest_snapshot.run_id, aged_out.job_id from aged_out
  on conflict do nothing;

  -- Report canonical jobs that transition inactive, not the number of source
  -- observations that happened to miss or age out.
  select count(*)::integer
  into deactivated_total
  from public.jobs as job
  where job.is_active
    and job.id in (
      select touched.job_id
      from app_meta.ingest_touched_jobs as touched
      where touched.run_id = apply_ingest_snapshot.run_id
    )
    and not exists (
      select 1
      from public.job_sources as observation
      where observation.job_id = job.id and observation.active
    );

  update public.jobs as job
  set is_active = exists (
        select 1 from public.job_sources as observation
        where observation.job_id = job.id and observation.active
      ),
      first_seen_at = coalesce((
        select min(observation.first_seen_at)
        from public.job_sources as observation where observation.job_id = job.id
      ), job.first_seen_at),
      last_seen_at = coalesce((
        select max(observation.last_seen_at)
        from public.job_sources as observation where observation.job_id = job.id
      ), job.last_seen_at),
      primary_source = coalesce((
        select observation.source
        from public.job_sources as observation
        where observation.job_id = job.id and observation.active
        order by observation.last_seen_at desc, observation.id desc
        limit 1
      ), job.primary_source),
      primary_apply_url = coalesce((
        select observation.apply_url
        from public.job_sources as observation
        where observation.job_id = job.id and observation.active
        order by observation.last_seen_at desc, observation.id desc
        limit 1
      ), job.primary_apply_url),
      term_keys = coalesce((
        select array_agg(term.value order by
          split_part(term.value, '-', 2)::integer,
          case split_part(term.value, '-', 1)
            when 'winter' then 0
            when 'spring' then 1
            when 'summer' then 2
            when 'fall' then 3
            else 4
          end
        )
        from (
          select distinct unnest(observation.term_keys) as value
          from public.job_sources as observation
          where observation.job_id = job.id and observation.active
        ) as term
      ), '{}'::text[]),
      salary_raw = canonical_salary.salary_raw,
      salary_currency = canonical_salary.salary_currency,
      salary_minimum = canonical_salary.salary_minimum,
      salary_maximum = canonical_salary.salary_maximum,
      salary_cadence = canonical_salary.salary_cadence,
      annualized_salary_minimum = canonical_salary.annualized_salary_minimum,
      annualized_salary_maximum = canonical_salary.annualized_salary_maximum,
      salary_parse_confidence = canonical_salary.salary_parse_confidence,
      salary_provenance = case
        when canonical_salary.id is null then null
        else 'source-listed'
      end,
      source_salary_sort_max = (
        select max(observation.annualized_salary_maximum)
        from public.job_sources as observation
        where observation.job_id = job.id
          and observation.active
          and observation.salary_provenance = 'source-listed'
          and observation.salary_currency = 'USD'
          and observation.salary_parse_confidence >= 0.8
      ),
      last_checked_at = now(),
      updated_at = now()
  from app_meta.ingest_touched_jobs as touched
  left join lateral (
    select observation.*
    from public.job_sources as observation
    where observation.job_id = touched.job_id
      and observation.active
      and observation.salary_raw is not null
      and observation.salary_provenance = 'source-listed'
    order by
      observation.salary_parse_confidence desc nulls last,
      observation.last_seen_at desc,
      observation.id desc
    limit 1
  ) as canonical_salary on true
  where touched.run_id = apply_ingest_snapshot.run_id
    and job.id = touched.job_id;

  insert into public.job_changes (
    job_id, run_id, changed_fields, previous_values, current_values
  )
  select
    job.id,
    apply_ingest_snapshot.run_id,
    array_remove(array[
      case
        when previous.primary_apply_url is distinct from job.primary_apply_url
          then 'apply_url'
      end,
      case when previous.title is distinct from job.title then 'title' end,
      case when previous.company is distinct from job.company then 'company' end,
      case
        when previous.display_location is distinct from job.display_location
          then 'location'
      end,
      case
        when previous.posted_date is distinct from job.posted_date
          then 'posted_date'
      end,
      case
        when previous.term_keys is distinct from job.term_keys
          then 'term_keys'
      end,
      case
        when previous.salary is distinct from jsonb_build_object(
          'raw', job.salary_raw,
          'currency', job.salary_currency,
          'minimum', job.salary_minimum,
          'maximum', job.salary_maximum,
          'cadence', job.salary_cadence,
          'annualized_minimum', job.annualized_salary_minimum,
          'annualized_maximum', job.annualized_salary_maximum,
          'parse_confidence', job.salary_parse_confidence,
          'provenance', job.salary_provenance
        ) then 'salary'
      end
    ], null::text),
    (case
      when previous.primary_apply_url is distinct from job.primary_apply_url
        then jsonb_build_object('apply_url', previous.primary_apply_url)
      else '{}'::jsonb
    end)
    || (case
      when previous.title is distinct from job.title
        then jsonb_build_object('title', previous.title)
      else '{}'::jsonb
    end)
    || (case
      when previous.company is distinct from job.company
        then jsonb_build_object('company', previous.company)
      else '{}'::jsonb
    end)
    || (case
      when previous.display_location is distinct from job.display_location
        then jsonb_build_object('location', previous.display_location)
      else '{}'::jsonb
    end)
    || (case
      when previous.posted_date is distinct from job.posted_date
        then jsonb_build_object('posted_date', previous.posted_date)
      else '{}'::jsonb
    end)
    || (case
      when previous.term_keys is distinct from job.term_keys
        then jsonb_build_object('term_keys', previous.term_keys)
      else '{}'::jsonb
    end)
    || (case
      when previous.salary is distinct from jsonb_build_object(
        'raw', job.salary_raw,
        'currency', job.salary_currency,
        'minimum', job.salary_minimum,
        'maximum', job.salary_maximum,
        'cadence', job.salary_cadence,
        'annualized_minimum', job.annualized_salary_minimum,
        'annualized_maximum', job.annualized_salary_maximum,
        'parse_confidence', job.salary_parse_confidence,
        'provenance', job.salary_provenance
      ) then jsonb_build_object('salary', previous.salary)
      else '{}'::jsonb
    end),
    (case
      when previous.primary_apply_url is distinct from job.primary_apply_url
        then jsonb_build_object('apply_url', job.primary_apply_url)
      else '{}'::jsonb
    end)
    || (case
      when previous.title is distinct from job.title
        then jsonb_build_object('title', job.title)
      else '{}'::jsonb
    end)
    || (case
      when previous.company is distinct from job.company
        then jsonb_build_object('company', job.company)
      else '{}'::jsonb
    end)
    || (case
      when previous.display_location is distinct from job.display_location
        then jsonb_build_object('location', job.display_location)
      else '{}'::jsonb
    end)
    || (case
      when previous.posted_date is distinct from job.posted_date
        then jsonb_build_object('posted_date', job.posted_date)
      else '{}'::jsonb
    end)
    || (case
      when previous.term_keys is distinct from job.term_keys
        then jsonb_build_object('term_keys', job.term_keys)
      else '{}'::jsonb
    end)
    || (case
      when previous.salary is distinct from jsonb_build_object(
        'raw', job.salary_raw,
        'currency', job.salary_currency,
        'minimum', job.salary_minimum,
        'maximum', job.salary_maximum,
        'cadence', job.salary_cadence,
        'annualized_minimum', job.annualized_salary_minimum,
        'annualized_maximum', job.annualized_salary_maximum,
        'parse_confidence', job.salary_parse_confidence,
        'provenance', job.salary_provenance
      ) then jsonb_build_object(
        'salary',
        jsonb_build_object(
          'raw', job.salary_raw,
          'currency', job.salary_currency,
          'minimum', job.salary_minimum,
          'maximum', job.salary_maximum,
          'cadence', job.salary_cadence,
          'annualized_minimum', job.annualized_salary_minimum,
          'annualized_maximum', job.annualized_salary_maximum,
          'parse_confidence', job.salary_parse_confidence,
          'provenance', job.salary_provenance
        )
      )
      else '{}'::jsonb
    end)
  from app_meta.ingest_previous_jobs as previous
  join public.jobs as job on job.id = previous.job_id
  where previous.run_id = apply_ingest_snapshot.run_id
    and (
       previous.primary_apply_url is distinct from job.primary_apply_url
     or previous.title is distinct from job.title
     or previous.company is distinct from job.company
     or previous.display_location is distinct from job.display_location
     or previous.posted_date is distinct from job.posted_date
     or previous.term_keys is distinct from job.term_keys
     or previous.salary is distinct from jsonb_build_object(
       'raw', job.salary_raw,
       'currency', job.salary_currency,
       'minimum', job.salary_minimum,
       'maximum', job.salary_maximum,
       'cadence', job.salary_cadence,
       'annualized_minimum', job.annualized_salary_minimum,
       'annualized_maximum', job.annualized_salary_maximum,
       'parse_confidence', job.salary_parse_confidence,
       'provenance', job.salary_provenance
     )
    );

  update public.ingest_runs as run
  set status = case when quarantined_total > 0 then 'partial' else 'healthy' end,
      snapshot_checksum = apply_ingest_snapshot.snapshot_checksum,
      raw_fetched_count = raw_total,
      parsed_count = parsed_total,
      accepted_count = accepted_total,
      rejected_count = rejected_total,
      inserted_count = inserted_total,
      updated_count = updated_total,
      deactivated_count = deactivated_total,
      duration_ms = greatest(0, (extract(epoch from (clock_timestamp() - run.started_at)) * 1000)::integer),
      monitoring = app_meta.build_ingest_monitoring(
        apply_ingest_snapshot.run_id,
        greatest(0, (extract(epoch from (clock_timestamp() - run.started_at)) * 1000)::integer)
      ),
      finished_at = clock_timestamp()
  where run.id = apply_ingest_snapshot.run_id;

  delete from app_meta.ingest_lease as lease
  where lease.singleton and lease.run_id = apply_ingest_snapshot.run_id;

  delete from app_meta.ingest_previous_jobs as previous
  where previous.run_id = apply_ingest_snapshot.run_id;
  delete from app_meta.ingest_touched_jobs as touched
  where touched.run_id = apply_ingest_snapshot.run_id;
  delete from app_meta.ingest_healthy_sources as healthy
  where healthy.run_id = apply_ingest_snapshot.run_id;

  return jsonb_build_object(
    'inserted', inserted_total,
    'updated', updated_total,
    'deactivated', deactivated_total,
    'healthy_sources', healthy_total,
    'quarantined_sources', quarantined_total
  );
end;
$function$


select cron.schedule('ingest-listings', '15 6,18 * * *', $schedule$

    select app_meta.reap_stale_ingest_runs(interval '20 minutes');

    with configuration as (
        select
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_function_url'
          ) as function_url,
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_cron_secret'
          ) as cron_secret
      )
    select net.http_post(
      url := configuration.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || configuration.cron_secret
      ),
      body := jsonb_build_object(
        'source', 'simplify', 'trigger', 'pg_cron:simplify',
        'mode', 'community'
      ),
      timeout_milliseconds := 60000
    )
    from configuration
    where length(configuration.function_url) <= 2048
      and configuration.function_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      and nullif(btrim(configuration.cron_secret), '') is not null;
  
$schedule$);

select cron.schedule('timley-ingest-zshah101', '20 6,18 * * *', $schedule$

    select app_meta.reap_stale_ingest_runs(interval '20 minutes');

    with configuration as (
        select
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_function_url'
          ) as function_url,
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_cron_secret'
          ) as cron_secret
      )
    select net.http_post(
      url := configuration.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || configuration.cron_secret
      ),
      body := jsonb_build_object(
        'source', 'zshah101', 'trigger', 'pg_cron:zshah101',
        'mode', 'community'
      ),
      timeout_milliseconds := 60000
    )
    from configuration
    where length(configuration.function_url) <= 2048
      and configuration.function_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      and nullif(btrim(configuration.cron_secret), '') is not null;
  
$schedule$);

select cron.schedule('timley-ingest-zapplyjobs', '25 6,18 * * *', $schedule$

    select app_meta.reap_stale_ingest_runs(interval '20 minutes');

    with configuration as (
        select
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_function_url'
          ) as function_url,
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_cron_secret'
          ) as cron_secret
      )
    select net.http_post(
      url := configuration.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || configuration.cron_secret
      ),
      body := jsonb_build_object(
        'source', 'zapplyjobs', 'trigger', 'pg_cron:zapplyjobs',
        'mode', 'community'
      ),
      timeout_milliseconds := 60000
    )
    from configuration
    where length(configuration.function_url) <= 2048
      and configuration.function_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      and nullif(btrim(configuration.cron_secret), '') is not null;
  
$schedule$);

select cron.schedule('timley-ingest-northwesternfintech', '30 6,18 * * *', $schedule$

    select app_meta.reap_stale_ingest_runs(interval '20 minutes');

    with configuration as (
        select
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_function_url'
          ) as function_url,
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_cron_secret'
          ) as cron_secret
      )
    select net.http_post(
      url := configuration.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || configuration.cron_secret
      ),
      body := jsonb_build_object(
        'source', 'northwesternfintech', 'trigger', 'pg_cron:northwesternfintech',
        'mode', 'community'
      ),
      timeout_milliseconds := 60000
    )
    from configuration
    where length(configuration.function_url) <= 2048
      and configuration.function_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      and nullif(btrim(configuration.cron_secret), '') is not null;
  
$schedule$);

select cron.schedule('timley-ingest-speedyapply', '35 6,18 * * *', $schedule$

    select app_meta.reap_stale_ingest_runs(interval '20 minutes');

    with configuration as (
        select
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_function_url'
          ) as function_url,
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_cron_secret'
          ) as cron_secret
      )
    select net.http_post(
      url := configuration.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || configuration.cron_secret
      ),
      body := jsonb_build_object(
        'source', 'speedyapply', 'trigger', 'pg_cron:speedyapply',
        'mode', 'community'
      ),
      timeout_milliseconds := 60000
    )
    from configuration
    where length(configuration.function_url) <= 2048
      and configuration.function_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      and nullif(btrim(configuration.cron_secret), '') is not null;
  
$schedule$);

select cron.schedule('timley-ingest-vanshb03', '40 6,18 * * *', $schedule$

    select app_meta.reap_stale_ingest_runs(interval '20 minutes');

    with configuration as (
        select
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_function_url'
          ) as function_url,
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'ingest_cron_secret'
          ) as cron_secret
      )
    select net.http_post(
      url := configuration.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || configuration.cron_secret
      ),
      body := jsonb_build_object(
        'source', 'vanshb03', 'trigger', 'pg_cron:vanshb03',
        'mode', 'community'
      ),
      timeout_milliseconds := 60000
    )
    from configuration
    where length(configuration.function_url) <= 2048
      and configuration.function_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      and nullif(btrim(configuration.cron_secret), '') is not null;
  
$schedule$);
