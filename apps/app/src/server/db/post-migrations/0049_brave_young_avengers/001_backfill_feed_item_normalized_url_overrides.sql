UPDATE serial_feed_item
SET normalized_url = SUBSTR(url, 1, INSTR(url, '#') - 1)
WHERE normalized_url IS NULL
  AND INSTR(url, '#') > 0;
