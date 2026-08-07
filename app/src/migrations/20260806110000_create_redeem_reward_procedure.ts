import { sql, type Kysely } from 'kysely';

// Each expected business outcome raises a custom, stable error code
// (KU001-KU005) that RedemptionRepository.redeemAtomically() translates
// into a domain error — these codes must stay in sync with that map.
//
// Idempotent-replay and the reward's active/cost/stock are re-checked here
// even though the app already checked them once — both reads are already
// needed for the write below (stock lives on the same row), so re-checking
// is free and closes the gap between the app's pre-check and this write.
//
// Known, accepted gap: two concurrent calls with the *same* idempotency key
// can both pass the replay check and both attempt the insert; the loser gets
// a raw 23505 rather than a graceful "already redeemed" response. The UNIQUE
// constraint still prevents an actual double-spend — it just surfaces as an
// untranslated error on that one losing request.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE FUNCTION redeem_reward(
      p_user_id uuid,
      p_reward_id uuid,
      p_idempotency_key text
    ) RETURNS TABLE (redemption_id uuid, status text)
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_existing record;
      v_reward record;
      v_redemption_id uuid;
      v_ledger_id bigint;
    BEGIN
      SELECT id, redemption.status INTO v_existing
        FROM redemption WHERE idempotency_key = p_idempotency_key;
      IF FOUND THEN
        RETURN QUERY SELECT v_existing.id, v_existing.status;
        RETURN;
      END IF;

      SELECT cost_points, stock, active INTO v_reward
        FROM reward WHERE id = p_reward_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'reward not found' USING ERRCODE = 'KU001';
      END IF;
      IF NOT v_reward.active THEN
        RAISE EXCEPTION 'reward inactive' USING ERRCODE = 'KU002';
      END IF;

      UPDATE receiver_balance
         SET earned_points = earned_points - v_reward.cost_points
       WHERE user_id = p_user_id
         AND earned_points >= v_reward.cost_points;
      IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM receiver_balance WHERE user_id = p_user_id) THEN
          RAISE EXCEPTION 'insufficient balance' USING ERRCODE = 'KU003';
        ELSE
          RAISE EXCEPTION 'recipient not provisioned' USING ERRCODE = 'KU005';
        END IF;
      END IF;

      IF v_reward.stock IS NOT NULL THEN
        UPDATE reward SET stock = stock - 1
         WHERE id = p_reward_id AND stock > 0;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'reward out of stock' USING ERRCODE = 'KU004';
        END IF;
      END IF;

      v_redemption_id := gen_random_uuid();
      INSERT INTO redemption (id, user_id, reward_id, cost_points, idempotency_key, status)
      VALUES (v_redemption_id, p_user_id, p_reward_id, v_reward.cost_points, p_idempotency_key, 'confirmed');

      INSERT INTO point_ledger (user_id, delta, ledger_type, ref_type, ref_id, idempotency_key)
      VALUES (
        p_user_id,
        -v_reward.cost_points,
        'redeem_spend',
        'redemption',
        v_redemption_id,
        'redemption:' || v_redemption_id || ':debit'
      )
      RETURNING id INTO v_ledger_id;

      UPDATE receiver_balance SET last_ledger_id = v_ledger_id WHERE user_id = p_user_id;

      INSERT INTO outbox (id, topic, payload)
      VALUES (
        'redemption:' || v_redemption_id,
        'reward.redeemed',
        jsonb_build_object(
          'redemptionId', v_redemption_id,
          'userId', p_user_id,
          'rewardId', p_reward_id,
          'costPoints', v_reward.cost_points
        )
      );

      RETURN QUERY SELECT v_redemption_id, 'confirmed'::text;
    END;
    $$;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP FUNCTION IF EXISTS redeem_reward(uuid, uuid, text);`.execute(
    db,
  );
}
