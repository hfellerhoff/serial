-- Existing users provisioned solely by an identity provider are exempt from
-- email verification; anyone with a usable credential account (or no accounts
-- at all) stays non-exempt.
UPDATE `serial_user`
SET `email_verification_exempt` = 1
WHERE `id` IN (
  SELECT `user_id`
  FROM `serial_account`
  GROUP BY `user_id`
  HAVING SUM(
    CASE
      WHEN `provider_id` = 'credential' AND `password` IS NOT NULL THEN 1
      ELSE 0
    END
  ) = 0
);
