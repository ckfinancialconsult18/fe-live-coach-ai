-- Knowledge Center 2.0: add archived flag + expand source_type enum

-- Add archived flag (soft-delete alternative)
alter table public.knowledge_documents
  add column if not exists archived boolean not null default false;

-- Expand source_type to allow URL and CSV imports
alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_source_type_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_source_type_check
  check (source_type in (
    'carrier_guide', 'underwriting_manual', 'script',
    'objection_handling', 'closing_technique', 'compliance',
    'product_doc', 'training', 'url_import', 'csv_data', 'other'
  ));

-- Index for archived filter
create index if not exists knowledge_documents_archived_idx
  on public.knowledge_documents (user_id, archived);
