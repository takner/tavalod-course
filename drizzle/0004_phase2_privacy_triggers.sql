-- Phase 2 integrity: private (surprise) spaces.
-- * Money inside a space may only involve members of that space and never touches event scopes
--   (so nothing private can leak through event balances or "can this event be closed?").
-- * The celebrant of an event can never be a member of that event's spaces.
-- Functions are replaced with supersets of the phase-1 checks; phase-1 rows (space_id null) are
-- validated exactly as before.

CREATE OR REPLACE FUNCTION tavalod_check_expense(p_expense_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  e record;
  payer_sum bigint;
  share_sum bigint;
  foreign_members int;
BEGIN
  SELECT id, group_id, event_id, space_id, gift_id, total_amount INTO e FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT coalesce(sum(amount), 0) INTO payer_sum FROM expense_payers WHERE expense_id = e.id;
  SELECT coalesce(sum(amount), 0) INTO share_sum FROM expense_shares WHERE expense_id = e.id;
  IF payer_sum <> e.total_amount THEN
    RAISE EXCEPTION 'expense % payers sum % <> total %', e.id, payer_sum, e.total_amount
      USING ERRCODE = 'check_violation';
  END IF;
  IF share_sum <> e.total_amount THEN
    RAISE EXCEPTION 'expense % shares sum % <> total %', e.id, share_sum, e.total_amount
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO foreign_members FROM (
    SELECT member_id FROM expense_payers WHERE expense_id = e.id
    UNION
    SELECT member_id FROM expense_shares WHERE expense_id = e.id
  ) m JOIN group_members gm ON gm.id = m.member_id
  WHERE gm.group_id <> e.group_id;
  IF foreign_members > 0 THEN
    RAISE EXCEPTION 'expense % references members of another group', e.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF e.event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM events ev WHERE ev.id = e.event_id AND ev.group_id = e.group_id
  ) THEN
    RAISE EXCEPTION 'expense % belongs to an event of another group', e.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF e.space_id IS NOT NULL THEN
    IF e.event_id IS NOT NULL THEN
      RAISE EXCEPTION 'private expense % must not be attached to an event scope', e.id USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM private_spaces s WHERE s.id = e.space_id AND s.group_id = e.group_id) THEN
      RAISE EXCEPTION 'expense % belongs to a space of another group', e.id USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM (
        SELECT member_id FROM expense_payers WHERE expense_id = e.id
        UNION
        SELECT member_id FROM expense_shares WHERE expense_id = e.id
      ) m
      WHERE NOT EXISTS (SELECT 1 FROM private_space_members sm WHERE sm.space_id = e.space_id AND sm.member_id = m.member_id)
    ) THEN
      RAISE EXCEPTION 'private expense % involves someone outside its space', e.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF e.gift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM gifts g WHERE g.id = e.gift_id AND g.space_id IS NOT DISTINCT FROM e.space_id
  ) THEN
    RAISE EXCEPTION 'expense % gift link does not match its space', e.id USING ERRCODE = 'check_violation';
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tavalod_check_settlement(p_settlement_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  s record;
  alloc_sum bigint;
  bad int;
BEGIN
  SELECT id, group_id, amount, from_member_id, to_member_id, space_id, gift_id INTO s FROM settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT coalesce(sum(amount), 0) INTO alloc_sum FROM settlement_allocations WHERE settlement_id = s.id;
  IF alloc_sum <> s.amount THEN
    RAISE EXCEPTION 'settlement % allocations sum % <> amount %', s.id, alloc_sum, s.amount
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO bad FROM group_members gm
  WHERE gm.id IN (s.from_member_id, s.to_member_id) AND gm.group_id <> s.group_id;
  IF bad > 0 THEN
    RAISE EXCEPTION 'settlement % references members of another group', s.id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO bad FROM settlement_allocations a JOIN events ev ON ev.id = a.event_id
  WHERE a.settlement_id = s.id AND ev.group_id <> s.group_id;
  IF bad > 0 THEN
    RAISE EXCEPTION 'settlement % allocated to an event of another group', s.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF s.space_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM settlement_allocations a WHERE a.settlement_id = s.id AND a.event_id IS NOT NULL) THEN
      RAISE EXCEPTION 'private settlement % must not be allocated to an event', s.id USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO bad FROM (VALUES (s.from_member_id), (s.to_member_id)) v(member_id)
    WHERE NOT EXISTS (SELECT 1 FROM private_space_members sm WHERE sm.space_id = s.space_id AND sm.member_id = v.member_id);
    IF bad > 0 THEN
      RAISE EXCEPTION 'private settlement % involves someone outside its space', s.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF s.gift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM gifts g WHERE g.id = s.gift_id AND g.space_id IS NOT DISTINCT FROM s.space_id
  ) THEN
    RAISE EXCEPTION 'settlement % gift link does not match its space', s.id USING ERRCODE = 'check_violation';
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tavalod_check_space_member() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  sp record;
BEGIN
  SELECT s.group_id, ev.celebrant_member_id INTO sp
  FROM private_spaces s JOIN events ev ON ev.id = s.event_id WHERE s.id = NEW.space_id;
  IF NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.id = NEW.member_id AND gm.group_id = sp.group_id) THEN
    RAISE EXCEPTION 'space member must belong to the same group' USING ERRCODE = 'check_violation';
  END IF;
  IF sp.celebrant_member_id IS NOT NULL AND sp.celebrant_member_id = NEW.member_id THEN
    RAISE EXCEPTION 'the celebrant cannot join a surprise space of their own event' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER private_space_members_guard
  BEFORE INSERT OR UPDATE ON private_space_members
  FOR EACH ROW EXECUTE FUNCTION tavalod_check_space_member();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tavalod_check_celebrant_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.celebrant_member_id IS NOT NULL AND NEW.celebrant_member_id IS DISTINCT FROM OLD.celebrant_member_id AND EXISTS (
    SELECT 1 FROM private_space_members sm JOIN private_spaces s ON s.id = sm.space_id
    WHERE s.event_id = NEW.id AND sm.member_id = NEW.celebrant_member_id
  ) THEN
    RAISE EXCEPTION 'the new celebrant is a member of a surprise space of this event' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER events_celebrant_guard
  BEFORE UPDATE OF celebrant_member_id ON events
  FOR EACH ROW EXECUTE FUNCTION tavalod_check_celebrant_change();
