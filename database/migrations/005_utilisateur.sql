-- 005 : comptes (patient, pharmacien, administrateur). Données personnelles : schéma prive.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('005', '005_utilisateur');

CREATE TABLE prive.utilisateur (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid               uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  email              text        NOT NULL
                       CHECK (length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Empreinte calculée par le back-end ; la base vérifie seulement qu'il s'agit d'argon2id.
  mot_de_passe_hache text        NOT NULL CHECK (mot_de_passe_hache LIKE '$argon2id$%'),
  role               text        NOT NULL CHECK (role IN ('patient', 'pharmacien', 'administrateur')),
  email_verifie_le   timestamptz,
  suspendu           boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE prive.utilisateur IS 'Un compte. R13 : aucune autre donnée personnelle que l''e-mail et le mot de passe protégé.';

-- Une adresse ne sert qu'à un compte, quelle que soit la casse.
CREATE UNIQUE INDEX utilisateur_email_unique ON prive.utilisateur (lower(email));

CREATE TRIGGER utilisateur_maj BEFORE UPDATE ON prive.utilisateur
  FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();

-- Vérifie qu'un compte a le rôle attendu (utilisé par les déclencheurs des autres tables).
CREATE FUNCTION prive.exiger_role(compte bigint, role_attendu text) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  IF compte IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM prive.utilisateur WHERE id = compte AND role = role_attendu
  ) THEN
    RAISE EXCEPTION 'Le compte % n''a pas le rôle %.', compte, role_attendu
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

COMMIT;
