UPDATE serial_feed_item
SET canonical_url = CASE
  WHEN INSTR(url, '#') > 0 THEN SUBSTR(url, 1, INSTR(url, '#') - 1)
  ELSE url
END
WHERE canonical_url IS NULL;
