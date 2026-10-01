-- Database-level safety net for money invariants. The service layer already validates these;
-- the deferred constraint triggers make it impossible to COMMIT an inconsistent state even if a
-- future code path forgets to. They fire at transaction end, so delete-and-reinsert edits work.

CREATE OR REPLACE FUNCTION tavalod_check_expense(p_expense_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  e record;
  payer_sum bigint;
  share_sum bigint;
  foreign_members int;
BEGIN
  SELECT id, group_id, event_id, total_amount INTO e FROM expenses WHERE id = p_expense_id;
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
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tavalod_expense_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    PERFORM tavalod_check_expense(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM tavalod_check_expense(OLD.expense_id);
  ELSE
    PERFORM tavalod_check_expense(NEW.expense_id);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER expenses_balanced
  AFTER INSERT OR UPDATE ON expenses
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tavalod_expense_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER expense_payers_balanced
  AFTER INSERT OR UPDATE OR DELETE ON expense_payers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tavalod_expense_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER expense_shares_balanced
  AFTER INSERT OR UPDATE OR DELETE ON expense_shares
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tavalod_expense_trigger();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tavalod_check_settlement(p_settlement_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  s record;
  alloc_sum bigint;
  bad int;
BEGIN
  SELECT id, group_id, amount, from_member_id, to_member_id INTO s FROM settlements WHERE id = p_settlement_id;
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
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tavalod_settlement_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'settlements' THEN
    PERFORM tavalod_check_settlement(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM tavalod_check_settlement(OLD.settlement_id);
  ELSE
    PERFORM tavalod_check_settlement(NEW.settlement_id);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER settlements_balanced
  AFTER INSERT OR UPDATE ON settlements
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tavalod_settlement_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER settlement_allocations_balanced
  AFTER INSERT OR UPDATE OR DELETE ON settlement_allocations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tavalod_settlement_trigger();
