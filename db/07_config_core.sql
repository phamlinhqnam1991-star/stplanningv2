-- ST Planning v010 Configuration Core
-- Max 8 statements per file.

CREATE TABLE IF NOT EXISTS config_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category text NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    parent_code text,
    enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (category, code)
);

CREATE TABLE IF NOT EXISTS config_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    link_type text NOT NULL,
    from_category text NOT NULL,
    from_code text NOT NULL,
    to_category text NOT NULL,
    to_code text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (link_type, from_category, from_code, to_category, to_code)
);

CREATE TABLE IF NOT EXISTS config_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    priority integer NOT NULL DEFAULT 100,
    condition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    action_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rule_type, code)
);

CREATE TABLE IF NOT EXISTS config_settings (
    setting_key text PRIMARY KEY,
    category text NOT NULL,
    label text NOT NULL,
    data_type text NOT NULL DEFAULT 'json',
    value_json jsonb NOT NULL DEFAULT 'null'::jsonb,
    enabled boolean NOT NULL DEFAULT true,
    description text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config_source_profiles (
    source_key text PRIMARY KEY,
    display_name text NOT NULL,
    sheet_name text,
    header_rows integer NOT NULL DEFAULT 1,
    baseline_columns integer NOT NULL DEFAULT 1,
    operation_slots integer,
    enabled boolean NOT NULL DEFAULT true,
    parser_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config_view_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    view_key text NOT NULL,
    profile_code text NOT NULL,
    name text NOT NULL,
    is_default boolean NOT NULL DEFAULT false,
    enabled boolean NOT NULL DEFAULT true,
    config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (view_key, profile_code)
);

CREATE INDEX IF NOT EXISTS ix_config_items_category
ON config_items (category, enabled, sort_order, code);

CREATE INDEX IF NOT EXISTS ix_config_rules_type
ON config_rules (rule_type, enabled, priority, code);
