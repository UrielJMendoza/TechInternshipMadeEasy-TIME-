import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BOARD_FILTERS,
  type BoardFilters,
} from "./boardFilterState";
import {
  SEARCH_ALERT_STATE_VERSION,
  createEmptySearchAlertState,
  evaluateSearchAlerts,
  getSearchAlertRoleId,
  parseSearchAlertState,
  serializeSearchAlertState,
  type SearchAlertState,
} from "./searchAlerts";
import type { SavedSearch } from "./savedSearches";
import type { Internship } from "./types";

const NOW = "2026-07-22T12:00:00.000Z";

function job(overrides: Partial<Internship> = {}): Internship {
  return {
    id: "job-1",
    title: "Cloud Platform Engineering Intern",
    company: "Example Labs",
    location: "Denver, CO",
    category: "cloud",
    role_type: "internship",
    season: "Summer 2027",
    salary: "$55/hr",
    link: "https://example.com/jobs/1",
    source: "fixture",
    sponsorship: "Offers visa sponsorship",
    posted_date: "2026-07-20",
    first_seen_at: "2026-07-20T12:00:00.000Z",
    last_seen_at: NOW,
    is_active: true,
    ...overrides,
  };
}

function filters(overrides: Partial<BoardFilters> = {}): BoardFilters {
  return {
    ...DEFAULT_BOARD_FILTERS,
    ...overrides,
  };
}

function search(
  id: string,
  overrides: Partial<SavedSearch> = {},
): SavedSearch {
  return {
    id,
    name: `Search ${id}`,
    filters: filters(),
    frequency: "instant",
    channels: { inApp: true, browser: false, email: false },
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

test("frequency gates instant, daily, weekly, and paused searches", () => {
  const state: SearchAlertState = {
    version: SEARCH_ALERT_STATE_VERSION,
    inbox: [],
    deliveredRoleIds: [],
    lastRunBySearch: {
      instant: NOW,
      daily: "2026-07-21T13:00:00.000Z",
      weekly: "2026-07-15T13:00:00.000Z",
      "daily-due": "2026-07-21T12:00:00.000Z",
      "weekly-due": "2026-07-15T12:00:00.000Z",
    },
  };
  const result = evaluateSearchAlerts({
    state,
    searches: [
      search("instant"),
      search("daily", { frequency: "daily" }),
      search("weekly", { frequency: "weekly" }),
      search("daily-due", {
        frequency: "daily",
        filters: filters({ query: "security" }),
      }),
      search("weekly-due", {
        frequency: "weekly",
        filters: filters({ query: "finance" }),
      }),
      search("paused", { frequency: "paused" }),
    ],
    jobs: [job()],
    now: NOW,
  });

  assert.deepEqual(result.ranSearchIds, [
    "instant",
    "daily-due",
    "weekly-due",
  ]);
  assert.equal(result.newAlerts.length, 1);
  assert.equal(result.newAlerts[0].savedSearchId, "instant");
  assert.equal(result.state.lastRunBySearch.instant, NOW);
  assert.equal(result.state.lastRunBySearch.paused, undefined);
});

test("searches without a supported local channel do not run or consume role dedupe", () => {
  const disabled = search("no-local-channel", {
    channels: { inApp: false, browser: false, email: false },
  });
  const result = evaluateSearchAlerts({
    state: createEmptySearchAlertState(),
    searches: [disabled],
    jobs: [job()],
    browserDeliveryAvailable: true,
    now: NOW,
  });

  assert.deepEqual(result.ranSearchIds, []);
  assert.deepEqual(result.newAlerts, []);
  assert.deepEqual(result.state.deliveredRoleIds, []);
  assert.equal(result.state.lastRunBySearch[disabled.id], undefined);
});

test("browser-only searches wait for explicit global browser delivery", () => {
  const browserOnly = search("browser-only", {
    channels: { inApp: false, browser: true, email: false },
  });
  const deferred = evaluateSearchAlerts({
    state: createEmptySearchAlertState(),
    searches: [browserOnly],
    jobs: [job()],
    browserDeliveryAvailable: false,
    now: NOW,
  });

  assert.deepEqual(deferred.ranSearchIds, []);
  assert.deepEqual(deferred.newAlerts, []);
  assert.deepEqual(deferred.state.deliveredRoleIds, []);
  assert.equal(deferred.state.lastRunBySearch[browserOnly.id], undefined);

  const delivered = evaluateSearchAlerts({
    state: deferred.state,
    searches: [browserOnly],
    jobs: [job()],
    browserDeliveryAvailable: true,
    now: NOW,
  });
  assert.deepEqual(delivered.ranSearchIds, [browserOnly.id]);
  assert.equal(delivered.newAlerts.length, 1);
  assert.equal(delivered.newAlerts[0].savedSearchId, browserOnly.id);
  assert.deepEqual(delivered.state.deliveredRoleIds, ["job-1"]);
});

test("the same canonical role is delivered only once across matching searches", () => {
  const role = job({
    canonical_record_key: "canonical-role-1",
    canonical_url: "https://canonical.example/jobs/1",
    id: "database-id",
  });
  const first = evaluateSearchAlerts({
    state: createEmptySearchAlertState(),
    searches: [search("first"), search("second")],
    jobs: [
      role,
      {
        ...role,
        id: "duplicate-source-row",
        link: "https://other-source.example/jobs/1",
      },
    ],
    now: NOW,
  });

  assert.equal(getSearchAlertRoleId(role), "canonical-role-1");
  assert.equal(first.newAlerts.length, 1);
  assert.equal(first.newAlerts[0].savedSearchId, "first");
  assert.deepEqual(first.state.deliveredRoleIds, ["canonical-role-1"]);
  assert.deepEqual(first.ranSearchIds, ["first", "second"]);

  const second = evaluateSearchAlerts({
    state: first.state,
    searches: [search("first"), search("second")],
    jobs: [role],
    now: "2026-07-22T12:01:00.000Z",
  });
  assert.equal(second.newAlerts.length, 0);
  assert.equal(second.state.inbox.length, 1);
});

test("alerts use public criteria, direct canonical links, and explanations", () => {
  const savedSearch = search("specific", {
    name: "Denver cloud roles",
    frequency: "daily",
    filters: filters({
      query: "platform",
      major: "computer-science",
      niche: "cloud-infra",
      locationIds: ["denver-co"],
      freshness: "new",
      collection: "saved",
      sort: "salary",
      stages: ["offer"],
      visaSponsorship: true,
      minimumSalary: "100000",
    }),
  });
  const result = evaluateSearchAlerts({
    state: createEmptySearchAlertState(),
    searches: [savedSearch],
    jobs: [
      job(),
      job({
        id: "unpaid",
        link: "https://example.com/jobs/unpaid",
        salary: null,
      }),
      job({
        id: "wrong-role",
        link: "https://example.com/jobs/new-grad",
        role_type: "new_grad",
      }),
    ],
    now: NOW,
  });

  assert.equal(result.newAlerts.length, 1);
  const alert = result.newAlerts[0];
  assert.equal(alert.savedSearchId, "specific");
  assert.equal(alert.savedSearchName, "Denver cloud roles");
  assert.equal(alert.frequency, "daily");
  assert.equal(alert.jobTitle, "Cloud Platform Engineering Intern");
  assert.equal(alert.company, "Example Labs");
  assert.equal(alert.location, "Denver, CO");
  assert.equal(
    alert.resultsUrl,
    "/jobs?q=platform&major=computer-science&niche=cloud-infra&locations=denver-co&freshness=new&visa=1&min-salary=100000",
  );
  assert.doesNotMatch(alert.resultsUrl, /collection|sort|stages/);
  assert.deepEqual(alert.matchReasons, [
    "Role type: Internship",
    "Keywords: platform",
    "Location: Denver, CO",
    "Major: Computer Science",
    "Specialization: Cloud / Infra",
    "Sponsorship: Explicitly offered",
    "Employer-listed pay: At least $100,000 annually",
    "Freshness: Added in the last 14 days",
  ]);
  assert.equal(alert.createdAt, NOW);
  assert.equal(alert.jobFirstSeenAt, "2026-07-20T12:00:00.000Z");
  assert.equal(alert.jobPostedAt, "2026-07-20");
});

test("remote, role, query, location, taxonomy, sponsorship, salary, and freshness all constrain matches", () => {
  const strict = search("strict", {
    filters: filters({
      query: "platform",
      remoteOnly: true,
      major: "computer-science",
      niche: "cloud-infra",
      visaSponsorship: true,
      minimumSalary: "100000",
      freshness: "hot",
    }),
  });
  const matching = job({
    location: "Remote — United States",
    first_seen_at: "2026-07-21T12:00:00.000Z",
  });
  const result = evaluateSearchAlerts({
    state: createEmptySearchAlertState(),
    searches: [strict],
    jobs: [
      matching,
      job({ id: "not-remote", link: "https://example.com/not-remote" }),
      job({
        id: "too-old",
        link: "https://example.com/too-old",
        location: "Remote — United States",
        posted_date: "2026-07-01",
        first_seen_at: "2026-07-01T12:00:00.000Z",
      }),
      job({
        id: "no-sponsor",
        link: "https://example.com/no-sponsor",
        location: "Remote — United States",
        sponsorship: null,
      }),
      job({
        id: "low-pay",
        link: "https://example.com/low-pay",
        location: "Remote — United States",
        salary: "$30/hr",
      }),
    ],
    now: NOW,
  });

  assert.equal(result.newAlerts.length, 1);
  assert.equal(result.newAlerts[0].roleId, matching.id);
  assert.match(
    result.newAlerts[0].matchReasons.join(" | "),
    /Work arrangement: Remote/,
  );
});

test("malformed and unknown-version local state fail safely while valid entries survive", () => {
  assert.deepEqual(
    parseSearchAlertState("{not-json"),
    createEmptySearchAlertState(),
  );
  assert.deepEqual(
    parseSearchAlertState(JSON.stringify({ version: 99 })),
    createEmptySearchAlertState(),
  );

  const validAlert = evaluateSearchAlerts({
    state: createEmptySearchAlertState(),
    searches: [search("valid")],
    jobs: [job()],
    now: NOW,
  }).newAlerts[0];
  const raw = `{
    "version": 1,
    "inbox": [
      ${JSON.stringify(validAlert)},
      {"id":"bad","roleId":"bad","savedSearchId":"x","resultsUrl":"javascript:alert(1)"}
    ],
    "deliveredRoleIds": ["${validAlert.roleId}", "${validAlert.roleId}", "", 42],
    "lastRunBySearch": {
      "valid": "${NOW}",
      "bad id": "${NOW}",
      "invalid-date": "yesterday",
      "__proto__": "${NOW}"
    }
  }`;
  const parsed = parseSearchAlertState(raw);

  assert.equal(parsed.inbox.length, 1);
  assert.deepEqual(parsed.deliveredRoleIds, [validAlert.roleId]);
  assert.deepEqual(parsed.lastRunBySearch, { valid: NOW });
  assert.deepEqual(
    parseSearchAlertState(serializeSearchAlertState(parsed)),
    parsed,
  );
});

test("restored alert links are restricted to public job filters", () => {
  const validAlert = evaluateSearchAlerts({
    state: createEmptySearchAlertState(),
    searches: [search("valid")],
    jobs: [job()],
    now: NOW,
  }).newAlerts[0];
  const raw = JSON.stringify({
    version: SEARCH_ALERT_STATE_VERSION,
    inbox: [
      {
        ...validAlert,
        resultsUrl:
          "/jobs?utm_private=1&q=cloud&collection=saved&stages=offer&locations=new-york-ny,denver-co",
      },
    ],
    deliveredRoleIds: [validAlert.roleId],
    lastRunBySearch: {},
  });

  const parsed = parseSearchAlertState(raw);
  assert.equal(parsed.inbox.length, 1);
  assert.equal(
    parsed.inbox[0].resultsUrl,
    "/jobs?q=cloud&locations=denver-co%2Cnew-york-ny",
  );
  assert.doesNotMatch(parsed.inbox[0].resultsUrl, /collection|stages|private/);
});

test("role identity falls back through canonical URL, database id, and link", () => {
  assert.equal(
    getSearchAlertRoleId(
      job({
        canonical_record_key: null,
        canonical_url: "https://canonical.example/job",
      }),
    ),
    "https://canonical.example/job",
  );
  assert.equal(
    getSearchAlertRoleId(
      job({
        canonical_record_key: null,
        canonical_url: undefined,
        id: "database-id",
      }),
    ),
    "database-id",
  );
  assert.equal(
    getSearchAlertRoleId(
      job({
        canonical_record_key: null,
        canonical_url: undefined,
        id: "",
        link: "https://example.com/fallback",
      }),
    ),
    "https://example.com/fallback",
  );
});
