export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_meta: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      ingest_runs: {
        Row: {
          accepted_count: number
          created_at: string
          deactivated_count: number
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          ingest_code_version: string
          inserted_count: number
          monitoring: Json
          parsed_count: number
          parser_version: string
          raw_fetched_count: number
          rejected_count: number
          snapshot_checksum: string | null
          started_at: string
          status: string
          trigger_origin: string
          updated_count: number
        }
        Insert: {
          accepted_count?: number
          created_at?: string
          deactivated_count?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          ingest_code_version: string
          inserted_count?: number
          monitoring?: Json
          parsed_count?: number
          parser_version: string
          raw_fetched_count?: number
          rejected_count?: number
          snapshot_checksum?: string | null
          started_at?: string
          status?: string
          trigger_origin?: string
          updated_count?: number
        }
        Update: {
          accepted_count?: number
          created_at?: string
          deactivated_count?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          ingest_code_version?: string
          inserted_count?: number
          monitoring?: Json
          parsed_count?: number
          parser_version?: string
          raw_fetched_count?: number
          rejected_count?: number
          snapshot_checksum?: string | null
          started_at?: string
          status?: string
          trigger_origin?: string
          updated_count?: number
        }
        Relationships: []
      }
      ingest_source_runs: {
        Row: {
          accepted_count: number
          complete_snapshot: boolean
          duration_ms: number | null
          error: string | null
          expected_markers_present: boolean
          fetched_count: number
          id: number
          parsed_count: number
          parser_version: string | null
          previous_healthy_count: number | null
          quarantine_reason: string | null
          quarantined: boolean
          ran_at: string
          raw_fetched_count: number
          rejected_count: number
          rejection_rate: number
          run_id: string | null
          schema_valid: boolean
          snapshot_checksum: string | null
          source: string
          succeeded: boolean
        }
        Insert: {
          accepted_count?: number
          complete_snapshot?: boolean
          duration_ms?: number | null
          error?: string | null
          expected_markers_present?: boolean
          fetched_count?: number
          id?: number
          parsed_count?: number
          parser_version?: string | null
          previous_healthy_count?: number | null
          quarantine_reason?: string | null
          quarantined?: boolean
          ran_at?: string
          raw_fetched_count?: number
          rejected_count?: number
          rejection_rate?: number
          run_id?: string | null
          schema_valid?: boolean
          snapshot_checksum?: string | null
          source: string
          succeeded: boolean
        }
        Update: {
          accepted_count?: number
          complete_snapshot?: boolean
          duration_ms?: number | null
          error?: string | null
          expected_markers_present?: boolean
          fetched_count?: number
          id?: number
          parsed_count?: number
          parser_version?: string | null
          previous_healthy_count?: number | null
          quarantine_reason?: string | null
          quarantined?: boolean
          ran_at?: string
          raw_fetched_count?: number
          rejected_count?: number
          rejection_rate?: number
          run_id?: string | null
          schema_valid?: boolean
          snapshot_checksum?: string | null
          source?: string
          succeeded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ingest_source_runs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      internships: {
        Row: {
          category: string
          company: string
          company_domain: string | null
          dedupe_key: string
          first_seen_at: string
          id: string
          is_active: boolean
          last_seen_at: string
          link: string
          location: string
          location_eligible: boolean
          posted_date: string | null
          role_type: string
          salary: string | null
          season: string | null
          source: string
          sponsorship: string | null
          term_keys: string[]
          title: string
        }
        Insert: {
          category?: string
          company: string
          company_domain?: string | null
          dedupe_key: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          link: string
          location?: string
          location_eligible?: boolean
          posted_date?: string | null
          role_type?: string
          salary?: string | null
          season?: string | null
          source: string
          sponsorship?: string | null
          term_keys?: string[]
          title: string
        }
        Update: {
          category?: string
          company?: string
          company_domain?: string | null
          dedupe_key?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          link?: string
          location?: string
          location_eligible?: boolean
          posted_date?: string | null
          role_type?: string
          salary?: string | null
          season?: string | null
          source?: string
          sponsorship?: string | null
          term_keys?: string[]
          title?: string
        }
        Relationships: []
      }
      job_changes: {
        Row: {
          changed_fields: string[]
          created_at: string
          current_values: Json
          id: number
          job_id: string
          previous_values: Json
          run_id: string | null
        }
        Insert: {
          changed_fields: string[]
          created_at?: string
          current_values?: Json
          id?: number
          job_id: string
          previous_values?: Json
          run_id?: string | null
        }
        Update: {
          changed_fields?: string[]
          created_at?: string
          current_values?: Json
          id?: number
          job_id?: string
          previous_values?: Json
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_changes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_changes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_match_candidates: {
        Row: {
          confidence: number
          created_at: string
          id: number
          left_job_id: string
          reason: string
          reviewed_at: string | null
          right_job_id: string
          status: string
        }
        Insert: {
          confidence: number
          created_at?: string
          id?: number
          left_job_id: string
          reason: string
          reviewed_at?: string | null
          right_job_id: string
          status?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: number
          left_job_id?: string
          reason?: string
          reviewed_at?: string | null
          right_job_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_match_candidates_left_job_id_fkey"
            columns: ["left_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_match_candidates_right_job_id_fkey"
            columns: ["right_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          job_id: string
          kind: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          job_id: string
          kind: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          job_id?: string
          kind?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sources: {
        Row: {
          active: boolean
          annualized_salary_maximum: number | null
          annualized_salary_minimum: number | null
          apply_url: string
          city: string | null
          country_code: string | null
          created_at: string
          external_id: string
          first_seen_at: string
          fuzzy_key: string | null
          healthy_miss_count: number
          id: number
          job_id: string
          last_checked_at: string
          last_seen_at: string
          last_seen_run_id: string | null
          location_type: string
          metro_id: string | null
          normalization_confidence: number
          parser_version: string
          posted_date: string | null
          raw_location: string
          raw_title: string
          region_code: string | null
          requisition_id: string | null
          salary_cadence: string | null
          salary_currency: string | null
          salary_maximum: number | null
          salary_minimum: number | null
          salary_parse_confidence: number | null
          salary_provenance: string | null
          salary_raw: string | null
          season: string | null
          snapshot_checksum: string | null
          source: string
          source_url: string | null
          term_keys: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          annualized_salary_maximum?: number | null
          annualized_salary_minimum?: number | null
          apply_url: string
          city?: string | null
          country_code?: string | null
          created_at?: string
          external_id: string
          first_seen_at?: string
          fuzzy_key?: string | null
          healthy_miss_count?: number
          id?: number
          job_id: string
          last_checked_at?: string
          last_seen_at?: string
          last_seen_run_id?: string | null
          location_type?: string
          metro_id?: string | null
          normalization_confidence?: number
          parser_version: string
          posted_date?: string | null
          raw_location?: string
          raw_title: string
          region_code?: string | null
          requisition_id?: string | null
          salary_cadence?: string | null
          salary_currency?: string | null
          salary_maximum?: number | null
          salary_minimum?: number | null
          salary_parse_confidence?: number | null
          salary_provenance?: string | null
          salary_raw?: string | null
          season?: string | null
          snapshot_checksum?: string | null
          source: string
          source_url?: string | null
          term_keys?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          annualized_salary_maximum?: number | null
          annualized_salary_minimum?: number | null
          apply_url?: string
          city?: string | null
          country_code?: string | null
          created_at?: string
          external_id?: string
          first_seen_at?: string
          fuzzy_key?: string | null
          healthy_miss_count?: number
          id?: number
          job_id?: string
          last_checked_at?: string
          last_seen_at?: string
          last_seen_run_id?: string | null
          location_type?: string
          metro_id?: string | null
          normalization_confidence?: number
          parser_version?: string
          posted_date?: string | null
          raw_location?: string
          raw_title?: string
          region_code?: string | null
          requisition_id?: string | null
          salary_cadence?: string | null
          salary_currency?: string | null
          salary_maximum?: number | null
          salary_minimum?: number | null
          salary_parse_confidence?: number | null
          salary_provenance?: string | null
          salary_raw?: string | null
          season?: string | null
          snapshot_checksum?: string | null
          source?: string
          source_url?: string | null
          term_keys?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_sources_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sources_last_seen_run_id_fkey"
            columns: ["last_seen_run_id"]
            isOneToOne: false
            referencedRelation: "ingest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          annualized_salary_maximum: number | null
          annualized_salary_minimum: number | null
          category: string
          city: string | null
          company: string
          company_domain: string | null
          company_domain_confidence: number | null
          country_code: string | null
          created_at: string
          display_location: string
          first_seen_at: string
          id: string
          is_active: boolean
          last_checked_at: string
          last_seen_at: string
          legacy_identity_key: string | null
          location_facets: string[]
          location_type: string
          major_ids: string[]
          metro_id: string | null
          niche_ids: string[]
          normalization_confidence: number
          posted_date: string | null
          primary_apply_url: string
          primary_source: string
          raw_location: string
          region_code: string | null
          role_type: string
          salary_cadence: string | null
          salary_currency: string | null
          salary_maximum: number | null
          salary_minimum: number | null
          salary_parse_confidence: number | null
          salary_provenance: string | null
          salary_raw: string | null
          search_text: string
          search_vector: unknown
          season: string | null
          sort_date: string
          source_salary_sort_max: number | null
          sponsorship: string | null
          term_keys: string[]
          title: string
          tracking_key: string
          updated_at: string
        }
        Insert: {
          annualized_salary_maximum?: number | null
          annualized_salary_minimum?: number | null
          category?: string
          city?: string | null
          company: string
          company_domain?: string | null
          company_domain_confidence?: number | null
          country_code?: string | null
          created_at?: string
          display_location?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_checked_at?: string
          last_seen_at?: string
          legacy_identity_key?: string | null
          location_facets?: string[]
          location_type?: string
          major_ids?: string[]
          metro_id?: string | null
          niche_ids?: string[]
          normalization_confidence?: number
          posted_date?: string | null
          primary_apply_url: string
          primary_source?: string
          raw_location?: string
          region_code?: string | null
          role_type?: string
          salary_cadence?: string | null
          salary_currency?: string | null
          salary_maximum?: number | null
          salary_minimum?: number | null
          salary_parse_confidence?: number | null
          salary_provenance?: string | null
          salary_raw?: string | null
          search_text?: string
          search_vector?: unknown
          season?: string | null
          sort_date?: string
          source_salary_sort_max?: number | null
          sponsorship?: string | null
          term_keys?: string[]
          title: string
          tracking_key?: string
          updated_at?: string
        }
        Update: {
          annualized_salary_maximum?: number | null
          annualized_salary_minimum?: number | null
          category?: string
          city?: string | null
          company?: string
          company_domain?: string | null
          company_domain_confidence?: number | null
          country_code?: string | null
          created_at?: string
          display_location?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_checked_at?: string
          last_seen_at?: string
          legacy_identity_key?: string | null
          location_facets?: string[]
          location_type?: string
          major_ids?: string[]
          metro_id?: string | null
          niche_ids?: string[]
          normalization_confidence?: number
          posted_date?: string | null
          primary_apply_url?: string
          primary_source?: string
          raw_location?: string
          region_code?: string | null
          role_type?: string
          salary_cadence?: string | null
          salary_currency?: string | null
          salary_maximum?: number | null
          salary_minimum?: number | null
          salary_parse_confidence?: number | null
          salary_provenance?: string | null
          salary_raw?: string | null
          search_text?: string
          search_vector?: unknown
          season?: string | null
          sort_date?: string
          source_salary_sort_max?: number | null
          sponsorship?: string | null
          term_keys?: string[]
          title?: string
          tracking_key?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      job_category_facets: {
        Row: {
          id: string | null
          job_count: number | null
          role_type: string | null
        }
        Relationships: []
      }
      job_location_facets: {
        Row: {
          id: string | null
          job_count: number | null
          role_type: string | null
        }
        Relationships: []
      }
      job_source_facets: {
        Row: {
          id: string | null
          job_count: number | null
          role_type: string | null
        }
        Relationships: []
      }
      job_term_facets: {
        Row: {
          id: string | null
          job_count: number | null
          role_type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_ingest_snapshot: {
        Args: {
          duration_ms: number
          jobs_payload: Json
          run_id: string
          snapshot_checksum: string
          source_results: Json
        }
        Returns: Json
      }
      authorize_ingest_request: {
        Args: { provided_digest: string }
        Returns: boolean
      }
      begin_ingest_run: {
        Args: {
          ingest_code_version: string
          parser_version: string
          trigger_origin: string
        }
        Returns: string
      }
      count_jobs: {
        Args: {
          p_freshness?: string
          p_location_ids?: string[]
          p_major_id?: string
          p_niche_id?: string
          p_query?: string
          p_remote_only?: boolean
          p_role_type?: string
          p_term_keys?: string[]
          p_tracking_keys?: string[]
          p_visa_sponsorship?: boolean
        }
        Returns: number
      }
      fail_ingest_run: {
        Args: {
          duration_ms: number
          error_message: string
          run_id: string
          source_results: Json
        }
        Returns: undefined
      }
      resolve_job_url_aliases: {
        Args: { p_url_hashes: string[] }
        Returns: {
          tracking_key: string
          url_hash: string
        }[]
      }
      search_jobs: {
        Args: {
          p_cursor_id?: string
          p_cursor_sort?: string
          p_cursor_time?: string
          p_freshness?: string
          p_location_ids?: string[]
          p_major_id?: string
          p_niche_id?: string
          p_page_size?: number
          p_query?: string
          p_remote_only?: boolean
          p_role_type?: string
          p_sort_key?: string
          p_term_keys?: string[]
          p_tracking_keys?: string[]
          p_visa_sponsorship?: boolean
        }
        Returns: {
          annualized_salary_maximum: number | null
          annualized_salary_minimum: number | null
          category: string
          city: string | null
          company: string
          company_domain: string | null
          company_domain_confidence: number | null
          country_code: string | null
          created_at: string
          display_location: string
          first_seen_at: string
          id: string
          is_active: boolean
          last_checked_at: string
          last_seen_at: string
          legacy_identity_key: string | null
          location_facets: string[]
          location_type: string
          major_ids: string[]
          metro_id: string | null
          niche_ids: string[]
          normalization_confidence: number
          posted_date: string | null
          primary_apply_url: string
          primary_source: string
          raw_location: string
          region_code: string | null
          role_type: string
          salary_cadence: string | null
          salary_currency: string | null
          salary_maximum: number | null
          salary_minimum: number | null
          salary_parse_confidence: number | null
          salary_provenance: string | null
          salary_raw: string | null
          search_text: string
          search_vector: unknown
          season: string | null
          sort_date: string
          source_salary_sort_max: number | null
          sponsorship: string | null
          term_keys: string[]
          title: string
          tracking_key: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

