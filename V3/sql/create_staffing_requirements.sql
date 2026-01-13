-- Create staffing_requirements table
-- This table stores the required daily staffing levels for each shift type and role

CREATE TABLE IF NOT EXISTS public.staffing_requirements (
  id BIGSERIAL PRIMARY KEY,
  period_id UUID REFERENCES public.rota_periods(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Day shift requirements
  day_sn_required NUMERIC(4,1) DEFAULT 3.0,  -- Staff Nurse + Charge Nurse combined
  day_na_required NUMERIC(4,1) DEFAULT 3.0,  -- Nursing Assistant
  
  -- Night shift requirements
  night_sn_required NUMERIC(4,1) DEFAULT 2.0, -- Staff Nurse + Charge Nurse combined
  night_na_required NUMERIC(4,1) DEFAULT 2.0, -- Nursing Assistant
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(period_id, date)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_staffing_requirements_period_date 
  ON public.staffing_requirements(period_id, date);

-- RLS: Enable row level security
ALTER TABLE public.staffing_requirements ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone authenticated can read
CREATE POLICY "Anyone can read staffing requirements"
  ON public.staffing_requirements
  FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policy: Only admins can insert/update/delete
CREATE POLICY "Only admins can modify staffing requirements"
  ON public.staffing_requirements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_staffing_requirements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_staffing_requirements_updated_at
  BEFORE UPDATE ON public.staffing_requirements
  FOR EACH ROW
  EXECUTE FUNCTION update_staffing_requirements_updated_at();

COMMENT ON TABLE public.staffing_requirements IS 'Stores required daily staffing levels for each period and date';
COMMENT ON COLUMN public.staffing_requirements.day_sn_required IS 'Required Staff Nurses + Charge Nurses for day shift';
COMMENT ON COLUMN public.staffing_requirements.day_na_required IS 'Required Nursing Assistants for day shift';
COMMENT ON COLUMN public.staffing_requirements.night_sn_required IS 'Required Staff Nurses + Charge Nurses for night shift';
COMMENT ON COLUMN public.staffing_requirements.night_na_required IS 'Required Nursing Assistants for night shift';
