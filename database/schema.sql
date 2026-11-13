--
-- PostgreSQL database dump
--

\restrict mawjoud

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: annuaire; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA annuaire;


--
-- Name: SCHEMA annuaire; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA annuaire IS 'Annuaire des pharmacies, médicaments et stocks.';


--
-- Name: prive; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA prive;


--
-- Name: SCHEMA prive; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA prive IS 'Données personnelles et internes : jamais accessibles au public.';


--
-- Name: publique; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA publique;


--
-- Name: SCHEMA publique; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA publique IS 'Vues publiques : seules tables lisibles par le rôle de lecture publique.';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: tracer_position(); Type: FUNCTION; Schema: annuaire; Owner: -
--

CREATE FUNCTION annuaire.tracer_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  motif   text   := nullif(current_setting('mawjoud.motif_position', true), '');
  acteur  bigint := nullif(current_setting('mawjoud.acteur_id', true), '')::bigint;
  demande bigint := nullif(current_setting('mawjoud.demande_position_id', true), '')::bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.latitude IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO annuaire.historique_position
      (pharmacie_id, nouvelle_latitude, nouvelle_longitude, nouvelle_confirmee, source_gps, motif, acteur_id, demande_position_id)
    VALUES
      (NEW.id, NEW.latitude, NEW.longitude, NEW.position_confirmee, NEW.source_gps,
       coalesce(motif, 'création de la fiche'), acteur, demande);
    RETURN NULL;
  END IF;

  IF NEW.latitude IS NOT DISTINCT FROM OLD.latitude
     AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude
     AND NEW.position_confirmee = OLD.position_confirmee THEN
    RETURN NULL;
  END IF;
  IF OLD.latitude IS NOT NULL AND motif IS NULL THEN
    RAISE EXCEPTION 'La pharmacie % a déjà une position : indiquez un motif (mawjoud.motif_position) pour la changer.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO annuaire.historique_position
    (pharmacie_id, ancienne_latitude, ancienne_longitude, ancienne_confirmee,
     nouvelle_latitude, nouvelle_longitude, nouvelle_confirmee, source_gps, motif, acteur_id, demande_position_id)
  VALUES
    (NEW.id, OLD.latitude, OLD.longitude, OLD.position_confirmee,
     NEW.latitude, NEW.longitude, NEW.position_confirmee, NEW.source_gps, motif, acteur, demande);
  RETURN NULL;
END;
$$;


--
-- Name: tracer_stock(); Type: FUNCTION; Schema: annuaire; Owner: -
--

CREATE FUNCTION annuaire.tracer_stock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO annuaire.historique_stock (pharmacie_id, medicament_id, statut, declare_le, declare_par)
  VALUES (NEW.pharmacie_id, NEW.medicament_id, NEW.statut, NEW.declare_le, NEW.declare_par);
  RETURN NULL;
END;
$$;


--
-- Name: verifier_declarant(); Type: FUNCTION; Schema: annuaire; Owner: -
--

CREATE FUNCTION annuaire.verifier_declarant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.statut IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM prive.rattachement_pharmacien r
      JOIN prive.utilisateur u ON u.id = r.utilisateur_id
     WHERE r.pharmacie_id = NEW.pharmacie_id
       AND r.utilisateur_id = NEW.declare_par
       AND r.statut = 'validee'
       AND NOT u.suspendu
  ) THEN
    RAISE EXCEPTION 'Seul un pharmacien vérifié de cette pharmacie peut déclarer son stock (R3, R9).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: exiger_role(bigint, text); Type: FUNCTION; Schema: prive; Owner: -
--

CREATE FUNCTION prive.exiger_role(compte bigint, role_attendu text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF compte IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM prive.utilisateur WHERE id = compte AND role = role_attendu
  ) THEN
    RAISE EXCEPTION 'Le compte % n''a pas le rôle %.', compte, role_attendu
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;


--
-- Name: verifier_alerte(); Type: FUNCTION; Schema: prive; Owner: -
--

CREATE FUNCTION prive.verifier_alerte() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM prive.exiger_role(NEW.utilisateur_id, 'patient');
  RETURN NEW;
END;
$$;


--
-- Name: verifier_demande_position(); Type: FUNCTION; Schema: prive; Owner: -
--

CREATE FUNCTION prive.verifier_demande_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM prive.exiger_role(NEW.demandeur_id, 'pharmacien');
  PERFORM prive.exiger_role(NEW.decide_par, 'administrateur');
  RETURN NEW;
END;
$$;


--
-- Name: verifier_rattachement(); Type: FUNCTION; Schema: prive; Owner: -
--

CREATE FUNCTION prive.verifier_rattachement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM prive.exiger_role(NEW.utilisateur_id, 'pharmacien');
  PERFORM prive.exiger_role(NEW.decide_par, 'administrateur');
  RETURN NEW;
END;
$$;


--
-- Name: verifier_signalement(); Type: FUNCTION; Schema: prive; Owner: -
--

CREATE FUNCTION prive.verifier_signalement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM prive.exiger_role(NEW.traite_par, 'administrateur');
  RETURN NEW;
END;
$$;


--
-- Name: interdire_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.interdire_modification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'La table %.% ne se modifie pas : on y ajoute seulement des lignes.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;


--
-- Name: maj_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.maj_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: normaliser(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normaliser(texte text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    RETURN lower(public.unaccent('public.unaccent'::regdictionary, texte));


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: gouvernorat; Type: TABLE; Schema: annuaire; Owner: -
--

CREATE TABLE annuaire.gouvernorat (
    code smallint NOT NULL,
    nom text NOT NULL,
    CONSTRAINT gouvernorat_code_check CHECK (((code >= 11) AND (code <= 83))),
    CONSTRAINT gouvernorat_nom_check CHECK ((nom <> ''::text))
);


--
-- Name: TABLE gouvernorat; Type: COMMENT; Schema: annuaire; Owner: -
--

COMMENT ON TABLE annuaire.gouvernorat IS 'Référence des 24 gouvernorats. Les noms arabes restent dans les traductions du front-end.';


--
-- Name: historique_position; Type: TABLE; Schema: annuaire; Owner: -
--

CREATE TABLE annuaire.historique_position (
    id bigint NOT NULL,
    pharmacie_id bigint NOT NULL,
    ancienne_latitude double precision,
    ancienne_longitude double precision,
    ancienne_confirmee boolean,
    nouvelle_latitude double precision,
    nouvelle_longitude double precision,
    nouvelle_confirmee boolean NOT NULL,
    source_gps text,
    motif text,
    acteur_id bigint,
    demande_position_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE historique_position; Type: COMMENT; Schema: annuaire; Owner: -
--

COMMENT ON TABLE annuaire.historique_position IS 'Journal des positions : on y ajoute, on n''y modifie ni n''y supprime rien.';


--
-- Name: historique_position_id_seq; Type: SEQUENCE; Schema: annuaire; Owner: -
--

ALTER TABLE annuaire.historique_position ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME annuaire.historique_position_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: historique_stock; Type: TABLE; Schema: annuaire; Owner: -
--

CREATE TABLE annuaire.historique_stock (
    id bigint NOT NULL,
    pharmacie_id bigint NOT NULL,
    medicament_id bigint NOT NULL,
    statut text NOT NULL,
    declare_le timestamp with time zone NOT NULL,
    declare_par bigint,
    CONSTRAINT historique_stock_statut_check CHECK ((statut = ANY (ARRAY['disponible'::text, 'quantite_limitee'::text, 'en_rupture'::text])))
);


--
-- Name: TABLE historique_stock; Type: COMMENT; Schema: annuaire; Owner: -
--

COMMENT ON TABLE annuaire.historique_stock IS 'Toutes les déclarations. Conservation proposée, à valider : 12 mois.';


--
-- Name: historique_stock_id_seq; Type: SEQUENCE; Schema: annuaire; Owner: -
--

ALTER TABLE annuaire.historique_stock ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME annuaire.historique_stock_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: horaire; Type: TABLE; Schema: annuaire; Owner: -
--

CREATE TABLE annuaire.horaire (
    id bigint NOT NULL,
    pharmacie_id bigint NOT NULL,
    jour smallint NOT NULL,
    ouverture time without time zone NOT NULL,
    fermeture time without time zone NOT NULL,
    CONSTRAINT horaire_check CHECK ((fermeture <> ouverture)),
    CONSTRAINT horaire_jour_check CHECK (((jour >= 0) AND (jour <= 6)))
);


--
-- Name: TABLE horaire; Type: COMMENT; Schema: annuaire; Owner: -
--

COMMENT ON TABLE annuaire.horaire IS 'Plages d''ouverture ; plusieurs plages possibles le même jour.';


--
-- Name: horaire_id_seq; Type: SEQUENCE; Schema: annuaire; Owner: -
--

ALTER TABLE annuaire.horaire ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME annuaire.horaire_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: medicament; Type: TABLE; Schema: annuaire; Owner: -
--

CREATE TABLE annuaire.medicament (
    id bigint NOT NULL,
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    code_source text,
    nom_commercial text NOT NULL,
    dci text NOT NULL,
    forme text,
    dosage text,
    categorie text,
    nom_ar text,
    dci_ar text,
    donnee_test boolean DEFAULT false NOT NULL,
    actif boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT medicament_dci_check CHECK ((dci <> ''::text)),
    CONSTRAINT medicament_nom_commercial_check CHECK ((nom_commercial <> ''::text))
);


--
-- Name: TABLE medicament; Type: COMMENT; Schema: annuaire; Owner: -
--

COMMENT ON TABLE annuaire.medicament IS 'Catalogue. Source officielle à brancher (nomenclature DPM) ; 40 lignes de test en attendant.';


--
-- Name: COLUMN medicament.actif; Type: COMMENT; Schema: annuaire; Owner: -
--

COMMENT ON COLUMN annuaire.medicament.actif IS 'Faux : retiré du catalogue, sans supprimer les alertes et l''historique.';


--
-- Name: medicament_id_seq; Type: SEQUENCE; Schema: annuaire; Owner: -
--

ALTER TABLE annuaire.medicament ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME annuaire.medicament_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pharmacie; Type: TABLE; Schema: annuaire; Owner: -
--

CREATE TABLE annuaire.pharmacie (
    id bigint NOT NULL,
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    id_source text,
    nom text,
    rue text,
    quartier text,
    ville text,
    code_postal text,
    gouvernorat_code smallint,
    telephone_principal text,
    telephones_autres text[] DEFAULT '{}'::text[] NOT NULL,
    latitude double precision,
    longitude double precision,
    position_confirmee boolean DEFAULT false NOT NULL,
    source_gps text,
    precision_gps text DEFAULT 'inconnu'::text NOT NULL,
    garde text,
    horaires_texte text,
    statut_publication text DEFAULT 'en_attente_position'::text NOT NULL,
    fusionnee_dans bigint,
    a_verifier boolean DEFAULT false NOT NULL,
    nom_a_verifier boolean DEFAULT false NOT NULL,
    sources text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pharmacie_code_postal_check CHECK ((code_postal ~ '^[0-9]{4}$'::text)),
    CONSTRAINT pharmacie_confirmation CHECK (((NOT position_confirmee) OR (latitude IS NOT NULL))),
    CONSTRAINT pharmacie_fusion CHECK ((((statut_publication = 'fusionnee'::text) = (fusionnee_dans IS NOT NULL)) AND (fusionnee_dans IS DISTINCT FROM id))),
    CONSTRAINT pharmacie_garde_check CHECK ((garde = ANY (ARRAY['jour'::text, 'nuit'::text]))),
    CONSTRAINT pharmacie_id_source_check CHECK ((id_source ~ '^C[0-9]{5}$'::text)),
    CONSTRAINT pharmacie_latitude_check CHECK (((latitude >= (30)::double precision) AND (latitude <= (38)::double precision))),
    CONSTRAINT pharmacie_longitude_check CHECK (((longitude >= (7)::double precision) AND (longitude <= (12)::double precision))),
    CONSTRAINT pharmacie_nom_check CHECK ((nom <> ''::text)),
    CONSTRAINT pharmacie_position_complete CHECK (((latitude IS NULL) = (longitude IS NULL))),
    CONSTRAINT pharmacie_position_sourcee CHECK (((latitude IS NULL) OR (source_gps IS NOT NULL))),
    CONSTRAINT pharmacie_precision_gps_check CHECK ((precision_gps = ANY (ARRAY['exact'::text, 'nom'::text, 'inconnu'::text]))),
    CONSTRAINT pharmacie_publique_complete CHECK (((statut_publication <> 'publiee'::text) OR (position_confirmee AND (nom IS NOT NULL) AND (NOT nom_a_verifier) AND (ville IS NOT NULL) AND (gouvernorat_code IS NOT NULL)))),
    CONSTRAINT pharmacie_source_gps_check CHECK ((source_gps = ANY (ARRAY['tunidoc'::text, 'osm_telephone'::text, 'osm_nom_ville'::text, 'saisie_pharmacien'::text, 'saisie_admin'::text]))),
    CONSTRAINT pharmacie_sources_check CHECK ((sources <@ ARRAY['tunidoc'::text, 'goafricaonline'::text, 'medtn'::text, 'pdf'::text, 'osm'::text, 'saisie_pharmacien'::text, 'saisie_admin'::text])),
    CONSTRAINT pharmacie_statut_publication_check CHECK ((statut_publication = ANY (ARRAY['en_attente_position'::text, 'a_relire'::text, 'publiee'::text, 'non_publiable'::text, 'fermee'::text, 'fusionnee'::text]))),
    CONSTRAINT pharmacie_telephone_principal_check CHECK ((telephone_principal ~ '^\+216[0-9]{8}$'::text)),
    CONSTRAINT pharmacie_telephones_autres_check CHECK ((array_to_string(telephones_autres, ' '::text) ~ '^(\+216[0-9]{8}( \+216[0-9]{8})*)?$'::text)),
    CONSTRAINT pharmacie_ville_check CHECK ((ville <> ''::text))
);


--
-- Name: TABLE pharmacie; Type: COMMENT; Schema: annuaire; Owner: -
--

COMMENT ON TABLE annuaire.pharmacie IS 'Annuaire complet. Seules les lignes « publiee » sortent, par la vue publique.pharmacie.';


--
-- Name: COLUMN pharmacie.id_source; Type: COMMENT; Schema: annuaire; Owner: -
--

COMMENT ON COLUMN annuaire.pharmacie.id_source IS 'Identifiant C00001… des CSV ; vide pour une fiche créée sur le site.';


--
-- Name: COLUMN pharmacie.horaires_texte; Type: COMMENT; Schema: annuaire; Owner: -
--

COMMENT ON COLUMN annuaire.pharmacie.horaires_texte IS 'Texte d''origine du CSV, gardé pour la traçabilité ; la forme structurée est dans annuaire.horaire.';


--
-- Name: pharmacie_id_seq; Type: SEQUENCE; Schema: annuaire; Owner: -
--

ALTER TABLE annuaire.pharmacie ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME annuaire.pharmacie_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stock; Type: TABLE; Schema: annuaire; Owner: -
--

CREATE TABLE annuaire.stock (
    pharmacie_id bigint NOT NULL,
    medicament_id bigint NOT NULL,
    statut text,
    declare_le timestamp with time zone,
    declare_par bigint,
    suivi_depuis timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_check CHECK (((statut IS NULL) = (declare_le IS NULL))),
    CONSTRAINT stock_statut_check CHECK ((statut = ANY (ARRAY['disponible'::text, 'quantite_limitee'::text, 'en_rupture'::text])))
);


--
-- Name: TABLE stock; Type: COMMENT; Schema: annuaire; Owner: -
--

COMMENT ON TABLE annuaire.stock IS 'Médicaments suivis par une pharmacie et dernier statut déclaré, en mot (R4, R15).';


--
-- Name: alerte; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.alerte (
    id bigint NOT NULL,
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    utilisateur_id bigint NOT NULL,
    medicament_id bigint NOT NULL,
    gouvernorat_code smallint,
    statut text DEFAULT 'active'::text NOT NULL,
    declenchee_le timestamp with time zone,
    declenchee_par_pharmacie bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alerte_check CHECK (((declenchee_le IS NULL) OR (statut = 'terminee'::text))),
    CONSTRAINT alerte_check1 CHECK (((declenchee_le IS NULL) = (declenchee_par_pharmacie IS NULL))),
    CONSTRAINT alerte_statut_check CHECK ((statut = ANY (ARRAY['active'::text, 'terminee'::text])))
);


--
-- Name: TABLE alerte; Type: COMMENT; Schema: prive; Owner: -
--

COMMENT ON TABLE prive.alerte IS 'R13 : seuls le compte, le médicament et le lieu sont gardés.';


--
-- Name: alerte_id_seq; Type: SEQUENCE; Schema: prive; Owner: -
--

ALTER TABLE prive.alerte ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME prive.alerte_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: demande_position; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.demande_position (
    id bigint NOT NULL,
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacie_id bigint NOT NULL,
    demandeur_id bigint,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    commentaire text,
    statut text DEFAULT 'en_attente'::text NOT NULL,
    motif_refus text,
    decide_par bigint,
    decide_le timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT demande_position_check CHECK (((statut = 'en_attente'::text) = (decide_le IS NULL))),
    CONSTRAINT demande_position_check1 CHECK (((statut <> 'refusee'::text) OR (motif_refus IS NOT NULL))),
    CONSTRAINT demande_position_commentaire_check CHECK ((length(commentaire) <= 1000)),
    CONSTRAINT demande_position_latitude_check CHECK (((latitude >= (30)::double precision) AND (latitude <= (38)::double precision))),
    CONSTRAINT demande_position_longitude_check CHECK (((longitude >= (7)::double precision) AND (longitude <= (12)::double precision))),
    CONSTRAINT demande_position_statut_check CHECK ((statut = ANY (ARRAY['en_attente'::text, 'validee'::text, 'refusee'::text])))
);


--
-- Name: TABLE demande_position; Type: COMMENT; Schema: prive; Owner: -
--

COMMENT ON TABLE prive.demande_position IS 'Position proposée. Validée, elle est recopiée dans annuaire.pharmacie et l''ancienne reste dans l''historique.';


--
-- Name: demande_position_id_seq; Type: SEQUENCE; Schema: prive; Owner: -
--

ALTER TABLE prive.demande_position ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME prive.demande_position_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: envoi_email; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.envoi_email (
    id bigint NOT NULL,
    type text NOT NULL,
    utilisateur_id bigint NOT NULL,
    alerte_id bigint,
    pharmacie_id bigint,
    statut text DEFAULT 'a_envoyer'::text NOT NULL,
    tentatives smallint DEFAULT 0 NOT NULL,
    prochaine_tentative_le timestamp with time zone DEFAULT now() NOT NULL,
    derniere_erreur text,
    envoye_le timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT envoi_email_check CHECK (((type <> 'alerte'::text) OR ((alerte_id IS NOT NULL) AND (pharmacie_id IS NOT NULL)))),
    CONSTRAINT envoi_email_check1 CHECK (((statut = 'envoye'::text) = (envoye_le IS NOT NULL))),
    CONSTRAINT envoi_email_statut_check CHECK ((statut = ANY (ARRAY['a_envoyer'::text, 'envoye'::text, 'abandonne'::text]))),
    CONSTRAINT envoi_email_tentatives_check CHECK ((tentatives >= 0)),
    CONSTRAINT envoi_email_type_check CHECK ((type = ANY (ARRAY['verification_email'::text, 'alerte'::text])))
);


--
-- Name: TABLE envoi_email; Type: COMMENT; Schema: prive; Owner: -
--

COMMENT ON TABLE prive.envoi_email IS 'File d''envoi : le back-end prend les lignes « a_envoyer » dont l''heure est venue.';


--
-- Name: envoi_email_id_seq; Type: SEQUENCE; Schema: prive; Owner: -
--

ALTER TABLE prive.envoi_email ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME prive.envoi_email_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: jeton; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.jeton (
    id bigint NOT NULL,
    utilisateur_id bigint NOT NULL,
    type text NOT NULL,
    jeton_hache bytea NOT NULL,
    expire_le timestamp with time zone,
    utilise_le timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jeton_check CHECK (((type = 'desabonnement'::text) OR (expire_le IS NOT NULL))),
    CONSTRAINT jeton_jeton_hache_check CHECK ((length(jeton_hache) = 32)),
    CONSTRAINT jeton_type_check CHECK ((type = ANY (ARRAY['verification_email'::text, 'desabonnement'::text])))
);


--
-- Name: jeton_id_seq; Type: SEQUENCE; Schema: prive; Owner: -
--

ALTER TABLE prive.jeton ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME prive.jeton_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: journal_audit; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.journal_audit (
    id bigint NOT NULL,
    acteur_id bigint,
    action text NOT NULL,
    cible_type text NOT NULL,
    cible_id text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT journal_audit_action_check CHECK ((action = ANY (ARRAY['valider'::text, 'refuser'::text, 'creer_fiche'::text, 'corriger'::text, 'fermer'::text, 'rouvrir'::text, 'fusionner'::text, 'retirer_inscription'::text, 'suspendre'::text, 'retablir'::text, 'supprimer_compte'::text, 'valider_position'::text, 'refuser_position'::text, 'traiter_signalement'::text]))),
    CONSTRAINT journal_audit_cible_type_check CHECK ((cible_type = ANY (ARRAY['pharmacie'::text, 'rattachement'::text, 'demande_position'::text, 'utilisateur'::text, 'signalement'::text, 'message_contact'::text])))
);


--
-- Name: journal_audit_id_seq; Type: SEQUENCE; Schema: prive; Owner: -
--

ALTER TABLE prive.journal_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME prive.journal_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: message_contact; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.message_contact (
    id bigint NOT NULL,
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    nom text,
    email text NOT NULL,
    sujet text NOT NULL,
    message text NOT NULL,
    pharmacie_id bigint,
    statut text DEFAULT 'nouveau'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_contact_email_check CHECK (((length(email) <= 254) AND (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text))),
    CONSTRAINT message_contact_message_check CHECK (((length(btrim(message)) >= 10) AND (length(btrim(message)) <= 2000))),
    CONSTRAINT message_contact_nom_check CHECK ((length(nom) <= 100)),
    CONSTRAINT message_contact_statut_check CHECK ((statut = ANY (ARRAY['nouveau'::text, 'traite'::text]))),
    CONSTRAINT message_contact_sujet_check CHECK ((sujet = ANY (ARRAY['question'::text, 'erreur_pharmacie'::text, 'pharmacien'::text, 'autre'::text])))
);


--
-- Name: TABLE message_contact; Type: COMMENT; Schema: prive; Owner: -
--

COMMENT ON TABLE prive.message_contact IS 'À traiter côté back-end. Conservation proposée, à valider : 12 mois.';


--
-- Name: message_contact_id_seq; Type: SEQUENCE; Schema: prive; Owner: -
--

ALTER TABLE prive.message_contact ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME prive.message_contact_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pharmacie_interne; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.pharmacie_interne (
    pharmacie_id bigint NOT NULL,
    nom_est_nom_de_personne boolean DEFAULT false NOT NULL,
    pharmacien_nom text,
    ids_sources text[] DEFAULT '{}'::text[] NOT NULL,
    osm_id text,
    motifs_a_verifier text[] DEFAULT '{}'::text[] NOT NULL,
    motif_non_publiable text,
    origine_nom text,
    origine_adresse text,
    origine_telephone text,
    origine_gps text,
    origine_garde text,
    origine_horaires text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pharmacie_interne_osm_id_check CHECK ((osm_id ~ '^[nwr][0-9]+$'::text))
);


--
-- Name: TABLE pharmacie_interne; Type: COMMENT; Schema: prive; Owner: -
--

COMMENT ON TABLE prive.pharmacie_interne IS 'Une ligne par pharmacie issue des CSV. Contient des noms de personnes : aucune vue publique n''y accède.';


--
-- Name: rattachement_pharmacien; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.rattachement_pharmacien (
    id bigint NOT NULL,
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    utilisateur_id bigint NOT NULL,
    pharmacie_id bigint,
    ajout_nom text,
    ajout_adresse text,
    ajout_ville text,
    ajout_telephone text,
    justificatif_texte text,
    justificatif_fichier_nom text,
    justificatif_fichier_taille integer,
    statut text DEFAULT 'en_attente'::text NOT NULL,
    conflit boolean DEFAULT false NOT NULL,
    motif_code text,
    motif_precision text,
    decide_par bigint,
    decide_le timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rattachement_pharmacien_ajout_telephone_check CHECK ((ajout_telephone ~ '^\+216[0-9]{8}$'::text)),
    CONSTRAINT rattachement_pharmacien_check CHECK (((pharmacie_id IS NOT NULL) OR ((ajout_nom IS NOT NULL) AND (ajout_ville IS NOT NULL)))),
    CONSTRAINT rattachement_pharmacien_check1 CHECK (((statut <> 'validee'::text) OR (pharmacie_id IS NOT NULL))),
    CONSTRAINT rattachement_pharmacien_check2 CHECK (((statut <> ALL (ARRAY['refusee'::text, 'retiree'::text])) OR (motif_code IS NOT NULL))),
    CONSTRAINT rattachement_pharmacien_check3 CHECK (((statut = 'en_attente'::text) = (decide_le IS NULL))),
    CONSTRAINT rattachement_pharmacien_justificatif_fichier_taille_check CHECK ((justificatif_fichier_taille > 0)),
    CONSTRAINT rattachement_pharmacien_justificatif_texte_check CHECK ((length(justificatif_texte) <= 2000)),
    CONSTRAINT rattachement_pharmacien_motif_code_check CHECK ((motif_code = ANY (ARRAY['justificatif_illisible'::text, 'informations_incompletes'::text, 'pharmacie_attribuee'::text, 'pharmacie_fermee'::text, 'compte_supprime'::text, 'autre'::text]))),
    CONSTRAINT rattachement_pharmacien_statut_check CHECK ((statut = ANY (ARRAY['en_attente'::text, 'validee'::text, 'refusee'::text, 'retiree'::text])))
);


--
-- Name: TABLE rattachement_pharmacien; Type: COMMENT; Schema: prive; Owner: -
--

COMMENT ON TABLE prive.rattachement_pharmacien IS 'Lien entre un compte pharmacien et sa pharmacie. Validé = pharmacie inscrite (F5, F8).';


--
-- Name: rattachement_pharmacien_id_seq; Type: SEQUENCE; Schema: prive; Owner: -
--

ALTER TABLE prive.rattachement_pharmacien ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME prive.rattachement_pharmacien_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: session; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.session (
    id_hache bytea NOT NULL,
    utilisateur_id bigint NOT NULL,
    donnees jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    derniere_activite_le timestamp with time zone DEFAULT now() NOT NULL,
    expire_le timestamp with time zone NOT NULL,
    CONSTRAINT session_check CHECK ((expire_le > created_at)),
    CONSTRAINT session_id_hache_check CHECK ((length(id_hache) = 32))
);


--
-- Name: TABLE session; Type: COMMENT; Schema: prive; Owner: -
--

COMMENT ON TABLE prive.session IS 'Sessions côté serveur ; le cookie HttpOnly porte l''identifiant, la base son empreinte.';


--
-- Name: signalement; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.signalement (
    id bigint NOT NULL,
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacie_id bigint NOT NULL,
    auteur_id bigint,
    type text NOT NULL,
    texte text NOT NULL,
    statut text DEFAULT 'nouveau'::text NOT NULL,
    traite_par bigint,
    traite_le timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT signalement_check CHECK (((statut = 'nouveau'::text) = (traite_le IS NULL))),
    CONSTRAINT signalement_statut_check CHECK ((statut = ANY (ARRAY['nouveau'::text, 'traite'::text, 'rejete'::text]))),
    CONSTRAINT signalement_texte_check CHECK (((length(btrim(texte)) >= 10) AND (length(btrim(texte)) <= 2000))),
    CONSTRAINT signalement_type_check CHECK ((type = ANY (ARRAY['adresse'::text, 'telephone'::text, 'position'::text, 'horaires'::text, 'fermeture'::text, 'autre'::text])))
);


--
-- Name: signalement_id_seq; Type: SEQUENCE; Schema: prive; Owner: -
--

ALTER TABLE prive.signalement ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME prive.signalement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: utilisateur; Type: TABLE; Schema: prive; Owner: -
--

CREATE TABLE prive.utilisateur (
    id bigint NOT NULL,
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    mot_de_passe_hache text NOT NULL,
    role text NOT NULL,
    email_verifie_le timestamp with time zone,
    suspendu boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT utilisateur_email_check CHECK (((length(email) <= 254) AND (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text))),
    CONSTRAINT utilisateur_mot_de_passe_hache_check CHECK ((mot_de_passe_hache ~~ '$argon2id$%'::text)),
    CONSTRAINT utilisateur_role_check CHECK ((role = ANY (ARRAY['patient'::text, 'pharmacien'::text, 'administrateur'::text])))
);


--
-- Name: TABLE utilisateur; Type: COMMENT; Schema: prive; Owner: -
--

COMMENT ON TABLE prive.utilisateur IS 'Un compte. R13 : aucune autre donnée personnelle que l''e-mail et le mot de passe protégé.';


--
-- Name: utilisateur_id_seq; Type: SEQUENCE; Schema: prive; Owner: -
--

ALTER TABLE prive.utilisateur ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME prive.utilisateur_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    nom text NOT NULL,
    applique_le timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schema_migrations_version_check CHECK ((version ~ '^[0-9]{3}$'::text))
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.schema_migrations IS 'Une ligne par migration appliquée. Une migration ne passe qu''une fois : sa clé primaire l''interdit.';


--
-- Name: gouvernorat; Type: VIEW; Schema: publique; Owner: -
--

CREATE VIEW publique.gouvernorat AS
 SELECT code,
    nom
   FROM annuaire.gouvernorat;


--
-- Name: horaire; Type: VIEW; Schema: publique; Owner: -
--

CREATE VIEW publique.horaire WITH (security_barrier='true') AS
 SELECT p.uuid AS pharmacie_id,
    h.jour,
    h.ouverture,
    h.fermeture
   FROM (annuaire.horaire h
     JOIN annuaire.pharmacie p ON ((p.id = h.pharmacie_id)))
  WHERE (p.statut_publication = 'publiee'::text);


--
-- Name: medicament; Type: VIEW; Schema: publique; Owner: -
--

CREATE VIEW publique.medicament AS
 SELECT uuid AS id,
    code_source,
    nom_commercial,
    dci,
    forme,
    dosage,
    categorie,
    nom_ar,
    dci_ar,
    donnee_test
   FROM annuaire.medicament
  WHERE actif;


--
-- Name: pharmacie; Type: VIEW; Schema: publique; Owner: -
--

CREATE VIEW publique.pharmacie WITH (security_barrier='true') AS
 SELECT p.uuid AS id,
    p.nom,
    p.rue,
    p.quartier,
    p.ville,
    p.code_postal,
    p.gouvernorat_code,
    g.nom AS gouvernorat,
    p.telephone_principal,
    p.telephones_autres,
    p.latitude,
    p.longitude,
    p.source_gps,
    p.garde,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM (prive.rattachement_pharmacien r
                 JOIN prive.utilisateur u ON ((u.id = r.utilisateur_id)))
              WHERE ((r.pharmacie_id = p.id) AND (r.statut = 'validee'::text) AND (NOT u.suspendu)))) THEN 'inscrite'::text
            WHEN (EXISTS ( SELECT 1
               FROM prive.rattachement_pharmacien r
              WHERE ((r.pharmacie_id = p.id) AND (r.statut = 'en_attente'::text)))) THEN 'reclamee'::text
            ELSE 'non_inscrite'::text
        END AS etat,
    p.updated_at
   FROM (annuaire.pharmacie p
     JOIN annuaire.gouvernorat g ON ((g.code = p.gouvernorat_code)))
  WHERE (p.statut_publication = 'publiee'::text);


--
-- Name: stock; Type: VIEW; Schema: publique; Owner: -
--

CREATE VIEW publique.stock WITH (security_barrier='true') AS
 SELECT p.uuid AS pharmacie_id,
    m.uuid AS medicament_id,
    s.statut,
    s.declare_le
   FROM ((annuaire.stock s
     JOIN annuaire.pharmacie p ON ((p.id = s.pharmacie_id)))
     JOIN annuaire.medicament m ON ((m.id = s.medicament_id)))
  WHERE ((s.statut IS NOT NULL) AND (p.statut_publication = 'publiee'::text) AND m.actif AND (EXISTS ( SELECT 1
           FROM (prive.rattachement_pharmacien r
             JOIN prive.utilisateur u ON ((u.id = r.utilisateur_id)))
          WHERE ((r.pharmacie_id = p.id) AND (r.statut = 'validee'::text) AND (NOT u.suspendu)))));


--
-- Name: gouvernorat gouvernorat_nom_key; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.gouvernorat
    ADD CONSTRAINT gouvernorat_nom_key UNIQUE (nom);


--
-- Name: gouvernorat gouvernorat_pkey; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.gouvernorat
    ADD CONSTRAINT gouvernorat_pkey PRIMARY KEY (code);


--
-- Name: historique_position historique_position_pkey; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.historique_position
    ADD CONSTRAINT historique_position_pkey PRIMARY KEY (id);


--
-- Name: historique_stock historique_stock_pkey; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.historique_stock
    ADD CONSTRAINT historique_stock_pkey PRIMARY KEY (id);


--
-- Name: horaire horaire_pharmacie_id_jour_ouverture_key; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.horaire
    ADD CONSTRAINT horaire_pharmacie_id_jour_ouverture_key UNIQUE (pharmacie_id, jour, ouverture);


--
-- Name: horaire horaire_pkey; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.horaire
    ADD CONSTRAINT horaire_pkey PRIMARY KEY (id);


--
-- Name: medicament medicament_code_source_key; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.medicament
    ADD CONSTRAINT medicament_code_source_key UNIQUE (code_source);


--
-- Name: medicament medicament_pkey; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.medicament
    ADD CONSTRAINT medicament_pkey PRIMARY KEY (id);


--
-- Name: medicament medicament_uuid_key; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.medicament
    ADD CONSTRAINT medicament_uuid_key UNIQUE (uuid);


--
-- Name: pharmacie pharmacie_id_source_key; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.pharmacie
    ADD CONSTRAINT pharmacie_id_source_key UNIQUE (id_source);


--
-- Name: pharmacie pharmacie_pkey; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.pharmacie
    ADD CONSTRAINT pharmacie_pkey PRIMARY KEY (id);


--
-- Name: pharmacie pharmacie_uuid_key; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.pharmacie
    ADD CONSTRAINT pharmacie_uuid_key UNIQUE (uuid);


--
-- Name: stock stock_pkey; Type: CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.stock
    ADD CONSTRAINT stock_pkey PRIMARY KEY (pharmacie_id, medicament_id);


--
-- Name: alerte alerte_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.alerte
    ADD CONSTRAINT alerte_pkey PRIMARY KEY (id);


--
-- Name: alerte alerte_uuid_key; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.alerte
    ADD CONSTRAINT alerte_uuid_key UNIQUE (uuid);


--
-- Name: demande_position demande_position_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.demande_position
    ADD CONSTRAINT demande_position_pkey PRIMARY KEY (id);


--
-- Name: demande_position demande_position_uuid_key; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.demande_position
    ADD CONSTRAINT demande_position_uuid_key UNIQUE (uuid);


--
-- Name: envoi_email envoi_email_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.envoi_email
    ADD CONSTRAINT envoi_email_pkey PRIMARY KEY (id);


--
-- Name: jeton jeton_jeton_hache_key; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.jeton
    ADD CONSTRAINT jeton_jeton_hache_key UNIQUE (jeton_hache);


--
-- Name: jeton jeton_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.jeton
    ADD CONSTRAINT jeton_pkey PRIMARY KEY (id);


--
-- Name: journal_audit journal_audit_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.journal_audit
    ADD CONSTRAINT journal_audit_pkey PRIMARY KEY (id);


--
-- Name: message_contact message_contact_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.message_contact
    ADD CONSTRAINT message_contact_pkey PRIMARY KEY (id);


--
-- Name: message_contact message_contact_uuid_key; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.message_contact
    ADD CONSTRAINT message_contact_uuid_key UNIQUE (uuid);


--
-- Name: pharmacie_interne pharmacie_interne_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.pharmacie_interne
    ADD CONSTRAINT pharmacie_interne_pkey PRIMARY KEY (pharmacie_id);


--
-- Name: rattachement_pharmacien rattachement_pharmacien_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.rattachement_pharmacien
    ADD CONSTRAINT rattachement_pharmacien_pkey PRIMARY KEY (id);


--
-- Name: rattachement_pharmacien rattachement_pharmacien_uuid_key; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.rattachement_pharmacien
    ADD CONSTRAINT rattachement_pharmacien_uuid_key UNIQUE (uuid);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id_hache);


--
-- Name: signalement signalement_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.signalement
    ADD CONSTRAINT signalement_pkey PRIMARY KEY (id);


--
-- Name: signalement signalement_uuid_key; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.signalement
    ADD CONSTRAINT signalement_uuid_key UNIQUE (uuid);


--
-- Name: utilisateur utilisateur_pkey; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.utilisateur
    ADD CONSTRAINT utilisateur_pkey PRIMARY KEY (id);


--
-- Name: utilisateur utilisateur_uuid_key; Type: CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.utilisateur
    ADD CONSTRAINT utilisateur_uuid_key UNIQUE (uuid);


--
-- Name: schema_migrations schema_migrations_nom_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_nom_key UNIQUE (nom);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: historique_position_demande; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX historique_position_demande ON annuaire.historique_position USING btree (demande_position_id) WHERE (demande_position_id IS NOT NULL);


--
-- Name: historique_position_pharmacie; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX historique_position_pharmacie ON annuaire.historique_position USING btree (pharmacie_id, created_at DESC);


--
-- Name: historique_stock_medicament; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX historique_stock_medicament ON annuaire.historique_stock USING btree (medicament_id);


--
-- Name: historique_stock_pharmacie; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX historique_stock_pharmacie ON annuaire.historique_stock USING btree (pharmacie_id, medicament_id, declare_le DESC);


--
-- Name: medicament_dci_trgm; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX medicament_dci_trgm ON annuaire.medicament USING gin (public.normaliser(dci) public.gin_trgm_ops);


--
-- Name: medicament_nom_trgm; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX medicament_nom_trgm ON annuaire.medicament USING gin (public.normaliser(nom_commercial) public.gin_trgm_ops);


--
-- Name: medicament_unique; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE UNIQUE INDEX medicament_unique ON annuaire.medicament USING btree (public.normaliser(nom_commercial), public.normaliser(COALESCE(dosage, ''::text)), public.normaliser(COALESCE(forme, ''::text)));


--
-- Name: pharmacie_carte; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX pharmacie_carte ON annuaire.pharmacie USING gist (point(longitude, latitude)) WHERE (statut_publication = 'publiee'::text);


--
-- Name: pharmacie_fusionnee_dans; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX pharmacie_fusionnee_dans ON annuaire.pharmacie USING btree (fusionnee_dans) WHERE (fusionnee_dans IS NOT NULL);


--
-- Name: pharmacie_gouvernorat; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX pharmacie_gouvernorat ON annuaire.pharmacie USING btree (gouvernorat_code);


--
-- Name: pharmacie_nom_trgm; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX pharmacie_nom_trgm ON annuaire.pharmacie USING gin (public.normaliser(nom) public.gin_trgm_ops);


--
-- Name: pharmacie_statut; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX pharmacie_statut ON annuaire.pharmacie USING btree (statut_publication);


--
-- Name: pharmacie_telephone; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX pharmacie_telephone ON annuaire.pharmacie USING btree (telephone_principal);


--
-- Name: pharmacie_ville; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX pharmacie_ville ON annuaire.pharmacie USING btree (public.normaliser(ville));


--
-- Name: stock_declare_par; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX stock_declare_par ON annuaire.stock USING btree (declare_par);


--
-- Name: stock_medicament; Type: INDEX; Schema: annuaire; Owner: -
--

CREATE INDEX stock_medicament ON annuaire.stock USING btree (medicament_id, statut);


--
-- Name: alerte_a_evaluer; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX alerte_a_evaluer ON prive.alerte USING btree (medicament_id, gouvernorat_code) WHERE (statut = 'active'::text);


--
-- Name: alerte_pharmacie; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX alerte_pharmacie ON prive.alerte USING btree (declenchee_par_pharmacie) WHERE (declenchee_par_pharmacie IS NOT NULL);


--
-- Name: alerte_sans_doublon; Type: INDEX; Schema: prive; Owner: -
--

CREATE UNIQUE INDEX alerte_sans_doublon ON prive.alerte USING btree (utilisateur_id, medicament_id, gouvernorat_code) NULLS NOT DISTINCT WHERE (statut = 'active'::text);


--
-- Name: alerte_utilisateur; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX alerte_utilisateur ON prive.alerte USING btree (utilisateur_id);


--
-- Name: demande_position_decide_par; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX demande_position_decide_par ON prive.demande_position USING btree (decide_par);


--
-- Name: demande_position_demandeur; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX demande_position_demandeur ON prive.demande_position USING btree (demandeur_id);


--
-- Name: demande_position_pharmacie; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX demande_position_pharmacie ON prive.demande_position USING btree (pharmacie_id);


--
-- Name: demande_position_une_en_attente; Type: INDEX; Schema: prive; Owner: -
--

CREATE UNIQUE INDEX demande_position_une_en_attente ON prive.demande_position USING btree (pharmacie_id) WHERE (statut = 'en_attente'::text);


--
-- Name: envoi_email_a_traiter; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX envoi_email_a_traiter ON prive.envoi_email USING btree (prochaine_tentative_le) WHERE (statut = 'a_envoyer'::text);


--
-- Name: envoi_email_pharmacie; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX envoi_email_pharmacie ON prive.envoi_email USING btree (pharmacie_id) WHERE (pharmacie_id IS NOT NULL);


--
-- Name: envoi_email_une_alerte; Type: INDEX; Schema: prive; Owner: -
--

CREATE UNIQUE INDEX envoi_email_une_alerte ON prive.envoi_email USING btree (alerte_id) WHERE (type = 'alerte'::text);


--
-- Name: envoi_email_utilisateur; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX envoi_email_utilisateur ON prive.envoi_email USING btree (utilisateur_id);


--
-- Name: jeton_desabonnement_unique; Type: INDEX; Schema: prive; Owner: -
--

CREATE UNIQUE INDEX jeton_desabonnement_unique ON prive.jeton USING btree (utilisateur_id) WHERE (type = 'desabonnement'::text);


--
-- Name: jeton_utilisateur; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX jeton_utilisateur ON prive.jeton USING btree (utilisateur_id);


--
-- Name: journal_audit_acteur; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX journal_audit_acteur ON prive.journal_audit USING btree (acteur_id);


--
-- Name: journal_audit_cible; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX journal_audit_cible ON prive.journal_audit USING btree (cible_type, cible_id);


--
-- Name: journal_audit_date; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX journal_audit_date ON prive.journal_audit USING btree (created_at DESC);


--
-- Name: message_contact_nouveaux; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX message_contact_nouveaux ON prive.message_contact USING btree (created_at) WHERE (statut = 'nouveau'::text);


--
-- Name: message_contact_pharmacie; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX message_contact_pharmacie ON prive.message_contact USING btree (pharmacie_id) WHERE (pharmacie_id IS NOT NULL);


--
-- Name: rattachement_decide_par; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX rattachement_decide_par ON prive.rattachement_pharmacien USING btree (decide_par);


--
-- Name: rattachement_en_attente; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX rattachement_en_attente ON prive.rattachement_pharmacien USING btree (created_at) WHERE (statut = 'en_attente'::text);


--
-- Name: rattachement_pharmacie; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX rattachement_pharmacie ON prive.rattachement_pharmacien USING btree (pharmacie_id, statut);


--
-- Name: rattachement_un_par_compte; Type: INDEX; Schema: prive; Owner: -
--

CREATE UNIQUE INDEX rattachement_un_par_compte ON prive.rattachement_pharmacien USING btree (utilisateur_id) WHERE (statut = 'validee'::text);


--
-- Name: rattachement_un_par_pharmacie; Type: INDEX; Schema: prive; Owner: -
--

CREATE UNIQUE INDEX rattachement_un_par_pharmacie ON prive.rattachement_pharmacien USING btree (pharmacie_id) WHERE (statut = 'validee'::text);


--
-- Name: rattachement_une_demande; Type: INDEX; Schema: prive; Owner: -
--

CREATE UNIQUE INDEX rattachement_une_demande ON prive.rattachement_pharmacien USING btree (utilisateur_id) WHERE (statut = 'en_attente'::text);


--
-- Name: session_expire; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX session_expire ON prive.session USING btree (expire_le);


--
-- Name: session_utilisateur; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX session_utilisateur ON prive.session USING btree (utilisateur_id);


--
-- Name: signalement_auteur; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX signalement_auteur ON prive.signalement USING btree (auteur_id);


--
-- Name: signalement_nouveaux; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX signalement_nouveaux ON prive.signalement USING btree (created_at) WHERE (statut = 'nouveau'::text);


--
-- Name: signalement_pharmacie; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX signalement_pharmacie ON prive.signalement USING btree (pharmacie_id);


--
-- Name: signalement_traite_par; Type: INDEX; Schema: prive; Owner: -
--

CREATE INDEX signalement_traite_par ON prive.signalement USING btree (traite_par);


--
-- Name: utilisateur_email_unique; Type: INDEX; Schema: prive; Owner: -
--

CREATE UNIQUE INDEX utilisateur_email_unique ON prive.utilisateur USING btree (lower(email));


--
-- Name: historique_position historique_position_fige; Type: TRIGGER; Schema: annuaire; Owner: -
--

CREATE TRIGGER historique_position_fige BEFORE DELETE OR UPDATE ON annuaire.historique_position FOR EACH ROW EXECUTE FUNCTION public.interdire_modification();


--
-- Name: historique_position historique_position_fige_vidage; Type: TRIGGER; Schema: annuaire; Owner: -
--

CREATE TRIGGER historique_position_fige_vidage BEFORE TRUNCATE ON annuaire.historique_position FOR EACH STATEMENT EXECUTE FUNCTION public.interdire_modification();


--
-- Name: historique_stock historique_stock_fige; Type: TRIGGER; Schema: annuaire; Owner: -
--

CREATE TRIGGER historique_stock_fige BEFORE DELETE OR UPDATE ON annuaire.historique_stock FOR EACH ROW EXECUTE FUNCTION public.interdire_modification();


--
-- Name: historique_stock historique_stock_fige_vidage; Type: TRIGGER; Schema: annuaire; Owner: -
--

CREATE TRIGGER historique_stock_fige_vidage BEFORE TRUNCATE ON annuaire.historique_stock FOR EACH STATEMENT EXECUTE FUNCTION public.interdire_modification();


--
-- Name: medicament medicament_maj; Type: TRIGGER; Schema: annuaire; Owner: -
--

CREATE TRIGGER medicament_maj BEFORE UPDATE ON annuaire.medicament FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();


--
-- Name: pharmacie pharmacie_maj; Type: TRIGGER; Schema: annuaire; Owner: -
--

CREATE TRIGGER pharmacie_maj BEFORE UPDATE ON annuaire.pharmacie FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();


--
-- Name: pharmacie pharmacie_tracer_position; Type: TRIGGER; Schema: annuaire; Owner: -
--

CREATE TRIGGER pharmacie_tracer_position AFTER INSERT OR UPDATE OF latitude, longitude, position_confirmee ON annuaire.pharmacie FOR EACH ROW EXECUTE FUNCTION annuaire.tracer_position();


--
-- Name: stock stock_declarant; Type: TRIGGER; Schema: annuaire; Owner: -
--

CREATE TRIGGER stock_declarant BEFORE INSERT OR UPDATE OF statut, declare_le ON annuaire.stock FOR EACH ROW EXECUTE FUNCTION annuaire.verifier_declarant();


--
-- Name: stock stock_tracer; Type: TRIGGER; Schema: annuaire; Owner: -
--

CREATE TRIGGER stock_tracer AFTER INSERT OR UPDATE OF statut, declare_le ON annuaire.stock FOR EACH ROW WHEN ((new.statut IS NOT NULL)) EXECUTE FUNCTION annuaire.tracer_stock();


--
-- Name: alerte alerte_maj; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER alerte_maj BEFORE UPDATE ON prive.alerte FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();


--
-- Name: alerte alerte_role; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER alerte_role BEFORE INSERT OR UPDATE OF utilisateur_id ON prive.alerte FOR EACH ROW EXECUTE FUNCTION prive.verifier_alerte();


--
-- Name: demande_position demande_position_maj; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER demande_position_maj BEFORE UPDATE ON prive.demande_position FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();


--
-- Name: demande_position demande_position_roles; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER demande_position_roles BEFORE INSERT OR UPDATE OF demandeur_id, decide_par ON prive.demande_position FOR EACH ROW EXECUTE FUNCTION prive.verifier_demande_position();


--
-- Name: envoi_email envoi_email_maj; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER envoi_email_maj BEFORE UPDATE ON prive.envoi_email FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();


--
-- Name: journal_audit journal_audit_fige; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER journal_audit_fige BEFORE DELETE OR UPDATE ON prive.journal_audit FOR EACH ROW EXECUTE FUNCTION public.interdire_modification();


--
-- Name: journal_audit journal_audit_fige_vidage; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER journal_audit_fige_vidage BEFORE TRUNCATE ON prive.journal_audit FOR EACH STATEMENT EXECUTE FUNCTION public.interdire_modification();


--
-- Name: message_contact message_contact_maj; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER message_contact_maj BEFORE UPDATE ON prive.message_contact FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();


--
-- Name: pharmacie_interne pharmacie_interne_maj; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER pharmacie_interne_maj BEFORE UPDATE ON prive.pharmacie_interne FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();


--
-- Name: rattachement_pharmacien rattachement_maj; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER rattachement_maj BEFORE UPDATE ON prive.rattachement_pharmacien FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();


--
-- Name: rattachement_pharmacien rattachement_roles; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER rattachement_roles BEFORE INSERT OR UPDATE OF utilisateur_id, decide_par ON prive.rattachement_pharmacien FOR EACH ROW EXECUTE FUNCTION prive.verifier_rattachement();


--
-- Name: signalement signalement_maj; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER signalement_maj BEFORE UPDATE ON prive.signalement FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();


--
-- Name: signalement signalement_role; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER signalement_role BEFORE INSERT OR UPDATE OF traite_par ON prive.signalement FOR EACH ROW EXECUTE FUNCTION prive.verifier_signalement();


--
-- Name: utilisateur utilisateur_maj; Type: TRIGGER; Schema: prive; Owner: -
--

CREATE TRIGGER utilisateur_maj BEFORE UPDATE ON prive.utilisateur FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();


--
-- Name: historique_position historique_position_demande_position_id_fkey; Type: FK CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.historique_position
    ADD CONSTRAINT historique_position_demande_position_id_fkey FOREIGN KEY (demande_position_id) REFERENCES prive.demande_position(id);


--
-- Name: historique_position historique_position_pharmacie_id_fkey; Type: FK CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.historique_position
    ADD CONSTRAINT historique_position_pharmacie_id_fkey FOREIGN KEY (pharmacie_id) REFERENCES annuaire.pharmacie(id);


--
-- Name: historique_stock historique_stock_medicament_id_fkey; Type: FK CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.historique_stock
    ADD CONSTRAINT historique_stock_medicament_id_fkey FOREIGN KEY (medicament_id) REFERENCES annuaire.medicament(id);


--
-- Name: historique_stock historique_stock_pharmacie_id_fkey; Type: FK CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.historique_stock
    ADD CONSTRAINT historique_stock_pharmacie_id_fkey FOREIGN KEY (pharmacie_id) REFERENCES annuaire.pharmacie(id);


--
-- Name: horaire horaire_pharmacie_id_fkey; Type: FK CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.horaire
    ADD CONSTRAINT horaire_pharmacie_id_fkey FOREIGN KEY (pharmacie_id) REFERENCES annuaire.pharmacie(id) ON DELETE CASCADE;


--
-- Name: pharmacie pharmacie_fusionnee_dans_fkey; Type: FK CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.pharmacie
    ADD CONSTRAINT pharmacie_fusionnee_dans_fkey FOREIGN KEY (fusionnee_dans) REFERENCES annuaire.pharmacie(id);


--
-- Name: pharmacie pharmacie_gouvernorat_code_fkey; Type: FK CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.pharmacie
    ADD CONSTRAINT pharmacie_gouvernorat_code_fkey FOREIGN KEY (gouvernorat_code) REFERENCES annuaire.gouvernorat(code);


--
-- Name: stock stock_declare_par_fkey; Type: FK CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.stock
    ADD CONSTRAINT stock_declare_par_fkey FOREIGN KEY (declare_par) REFERENCES prive.utilisateur(id) ON DELETE SET NULL;


--
-- Name: stock stock_medicament_id_fkey; Type: FK CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.stock
    ADD CONSTRAINT stock_medicament_id_fkey FOREIGN KEY (medicament_id) REFERENCES annuaire.medicament(id);


--
-- Name: stock stock_pharmacie_id_fkey; Type: FK CONSTRAINT; Schema: annuaire; Owner: -
--

ALTER TABLE ONLY annuaire.stock
    ADD CONSTRAINT stock_pharmacie_id_fkey FOREIGN KEY (pharmacie_id) REFERENCES annuaire.pharmacie(id);


--
-- Name: alerte alerte_declenchee_par_pharmacie_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.alerte
    ADD CONSTRAINT alerte_declenchee_par_pharmacie_fkey FOREIGN KEY (declenchee_par_pharmacie) REFERENCES annuaire.pharmacie(id);


--
-- Name: alerte alerte_gouvernorat_code_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.alerte
    ADD CONSTRAINT alerte_gouvernorat_code_fkey FOREIGN KEY (gouvernorat_code) REFERENCES annuaire.gouvernorat(code);


--
-- Name: alerte alerte_medicament_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.alerte
    ADD CONSTRAINT alerte_medicament_id_fkey FOREIGN KEY (medicament_id) REFERENCES annuaire.medicament(id);


--
-- Name: alerte alerte_utilisateur_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.alerte
    ADD CONSTRAINT alerte_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES prive.utilisateur(id) ON DELETE CASCADE;


--
-- Name: demande_position demande_position_decide_par_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.demande_position
    ADD CONSTRAINT demande_position_decide_par_fkey FOREIGN KEY (decide_par) REFERENCES prive.utilisateur(id) ON DELETE SET NULL;


--
-- Name: demande_position demande_position_demandeur_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.demande_position
    ADD CONSTRAINT demande_position_demandeur_id_fkey FOREIGN KEY (demandeur_id) REFERENCES prive.utilisateur(id) ON DELETE SET NULL;


--
-- Name: demande_position demande_position_pharmacie_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.demande_position
    ADD CONSTRAINT demande_position_pharmacie_id_fkey FOREIGN KEY (pharmacie_id) REFERENCES annuaire.pharmacie(id);


--
-- Name: envoi_email envoi_email_alerte_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.envoi_email
    ADD CONSTRAINT envoi_email_alerte_id_fkey FOREIGN KEY (alerte_id) REFERENCES prive.alerte(id) ON DELETE CASCADE;


--
-- Name: envoi_email envoi_email_pharmacie_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.envoi_email
    ADD CONSTRAINT envoi_email_pharmacie_id_fkey FOREIGN KEY (pharmacie_id) REFERENCES annuaire.pharmacie(id);


--
-- Name: envoi_email envoi_email_utilisateur_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.envoi_email
    ADD CONSTRAINT envoi_email_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES prive.utilisateur(id) ON DELETE CASCADE;


--
-- Name: jeton jeton_utilisateur_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.jeton
    ADD CONSTRAINT jeton_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES prive.utilisateur(id) ON DELETE CASCADE;


--
-- Name: message_contact message_contact_pharmacie_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.message_contact
    ADD CONSTRAINT message_contact_pharmacie_id_fkey FOREIGN KEY (pharmacie_id) REFERENCES annuaire.pharmacie(id);


--
-- Name: pharmacie_interne pharmacie_interne_pharmacie_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.pharmacie_interne
    ADD CONSTRAINT pharmacie_interne_pharmacie_id_fkey FOREIGN KEY (pharmacie_id) REFERENCES annuaire.pharmacie(id);


--
-- Name: rattachement_pharmacien rattachement_pharmacien_decide_par_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.rattachement_pharmacien
    ADD CONSTRAINT rattachement_pharmacien_decide_par_fkey FOREIGN KEY (decide_par) REFERENCES prive.utilisateur(id) ON DELETE SET NULL;


--
-- Name: rattachement_pharmacien rattachement_pharmacien_pharmacie_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.rattachement_pharmacien
    ADD CONSTRAINT rattachement_pharmacien_pharmacie_id_fkey FOREIGN KEY (pharmacie_id) REFERENCES annuaire.pharmacie(id);


--
-- Name: rattachement_pharmacien rattachement_pharmacien_utilisateur_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.rattachement_pharmacien
    ADD CONSTRAINT rattachement_pharmacien_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES prive.utilisateur(id) ON DELETE CASCADE;


--
-- Name: session session_utilisateur_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.session
    ADD CONSTRAINT session_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES prive.utilisateur(id) ON DELETE CASCADE;


--
-- Name: signalement signalement_auteur_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.signalement
    ADD CONSTRAINT signalement_auteur_id_fkey FOREIGN KEY (auteur_id) REFERENCES prive.utilisateur(id) ON DELETE SET NULL;


--
-- Name: signalement signalement_pharmacie_id_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.signalement
    ADD CONSTRAINT signalement_pharmacie_id_fkey FOREIGN KEY (pharmacie_id) REFERENCES annuaire.pharmacie(id);


--
-- Name: signalement signalement_traite_par_fkey; Type: FK CONSTRAINT; Schema: prive; Owner: -
--

ALTER TABLE ONLY prive.signalement
    ADD CONSTRAINT signalement_traite_par_fkey FOREIGN KEY (traite_par) REFERENCES prive.utilisateur(id) ON DELETE SET NULL;


--
-- Name: SCHEMA annuaire; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA annuaire TO mawjoud_application;


--
-- Name: SCHEMA prive; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA prive TO mawjoud_application;


--
-- Name: SCHEMA publique; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA publique TO mawjoud_lecture_publique;
GRANT USAGE ON SCHEMA publique TO mawjoud_application;


--
-- Name: TABLE gouvernorat; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT ON TABLE annuaire.gouvernorat TO mawjoud_application;


--
-- Name: TABLE historique_position; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,INSERT ON TABLE annuaire.historique_position TO mawjoud_application;


--
-- Name: SEQUENCE historique_position_id_seq; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE annuaire.historique_position_id_seq TO mawjoud_application;


--
-- Name: TABLE historique_stock; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,INSERT ON TABLE annuaire.historique_stock TO mawjoud_application;


--
-- Name: SEQUENCE historique_stock_id_seq; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE annuaire.historique_stock_id_seq TO mawjoud_application;


--
-- Name: TABLE horaire; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE annuaire.horaire TO mawjoud_application;


--
-- Name: SEQUENCE horaire_id_seq; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE annuaire.horaire_id_seq TO mawjoud_application;


--
-- Name: TABLE medicament; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE annuaire.medicament TO mawjoud_application;


--
-- Name: SEQUENCE medicament_id_seq; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE annuaire.medicament_id_seq TO mawjoud_application;


--
-- Name: TABLE pharmacie; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE annuaire.pharmacie TO mawjoud_application;


--
-- Name: SEQUENCE pharmacie_id_seq; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE annuaire.pharmacie_id_seq TO mawjoud_application;


--
-- Name: TABLE stock; Type: ACL; Schema: annuaire; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE annuaire.stock TO mawjoud_application;


--
-- Name: TABLE alerte; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE prive.alerte TO mawjoud_application;


--
-- Name: SEQUENCE alerte_id_seq; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE prive.alerte_id_seq TO mawjoud_application;


--
-- Name: TABLE demande_position; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE prive.demande_position TO mawjoud_application;


--
-- Name: SEQUENCE demande_position_id_seq; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE prive.demande_position_id_seq TO mawjoud_application;


--
-- Name: TABLE envoi_email; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE prive.envoi_email TO mawjoud_application;


--
-- Name: SEQUENCE envoi_email_id_seq; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE prive.envoi_email_id_seq TO mawjoud_application;


--
-- Name: TABLE jeton; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE prive.jeton TO mawjoud_application;


--
-- Name: SEQUENCE jeton_id_seq; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE prive.jeton_id_seq TO mawjoud_application;


--
-- Name: TABLE journal_audit; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT ON TABLE prive.journal_audit TO mawjoud_application;


--
-- Name: SEQUENCE journal_audit_id_seq; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE prive.journal_audit_id_seq TO mawjoud_application;


--
-- Name: TABLE message_contact; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE prive.message_contact TO mawjoud_application;


--
-- Name: SEQUENCE message_contact_id_seq; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE prive.message_contact_id_seq TO mawjoud_application;


--
-- Name: TABLE pharmacie_interne; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE prive.pharmacie_interne TO mawjoud_application;


--
-- Name: TABLE rattachement_pharmacien; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE prive.rattachement_pharmacien TO mawjoud_application;


--
-- Name: SEQUENCE rattachement_pharmacien_id_seq; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE prive.rattachement_pharmacien_id_seq TO mawjoud_application;


--
-- Name: TABLE session; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE prive.session TO mawjoud_application;


--
-- Name: TABLE signalement; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE prive.signalement TO mawjoud_application;


--
-- Name: SEQUENCE signalement_id_seq; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE prive.signalement_id_seq TO mawjoud_application;


--
-- Name: TABLE utilisateur; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE prive.utilisateur TO mawjoud_application;


--
-- Name: SEQUENCE utilisateur_id_seq; Type: ACL; Schema: prive; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE prive.utilisateur_id_seq TO mawjoud_application;


--
-- Name: TABLE gouvernorat; Type: ACL; Schema: publique; Owner: -
--

GRANT SELECT ON TABLE publique.gouvernorat TO mawjoud_lecture_publique;
GRANT SELECT ON TABLE publique.gouvernorat TO mawjoud_application;


--
-- Name: TABLE horaire; Type: ACL; Schema: publique; Owner: -
--

GRANT SELECT ON TABLE publique.horaire TO mawjoud_lecture_publique;
GRANT SELECT ON TABLE publique.horaire TO mawjoud_application;


--
-- Name: TABLE medicament; Type: ACL; Schema: publique; Owner: -
--

GRANT SELECT ON TABLE publique.medicament TO mawjoud_lecture_publique;
GRANT SELECT ON TABLE publique.medicament TO mawjoud_application;


--
-- Name: TABLE pharmacie; Type: ACL; Schema: publique; Owner: -
--

GRANT SELECT ON TABLE publique.pharmacie TO mawjoud_lecture_publique;
GRANT SELECT ON TABLE publique.pharmacie TO mawjoud_application;


--
-- Name: TABLE stock; Type: ACL; Schema: publique; Owner: -
--

GRANT SELECT ON TABLE publique.stock TO mawjoud_lecture_publique;
GRANT SELECT ON TABLE publique.stock TO mawjoud_application;


--
-- PostgreSQL database dump complete
--

\unrestrict mawjoud

