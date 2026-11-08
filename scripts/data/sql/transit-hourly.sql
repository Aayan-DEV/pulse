-- Hourly delay and cancellation aggregates for the stops serving Burger King Klingenberg.
-- Source: Entur realtime SIRI-ET, last recorded message per journey (one row per stop call).
-- Params: @d0, @d1 (operatingDate range). Run per year to keep each scan under 100 GB.
WITH calls AS (
  SELECT
    CASE WHEN stopPointRef IN ('NSR:Quay:475','NSR:Quay:476','NSR:Quay:477','NSR:Quay:478')
           OR (stopPointName LIKE 'Nationaltheatret%' AND dataSource <> 'RUT') THEN 'NT'
         WHEN stopPointName LIKE 'Nationaltheatret%' THEN 'NT'
         ELSE 'OSL' END AS stop,
    CASE
      WHEN dataSource <> 'RUT' THEN 'rail'
      WHEN SAFE_CAST(REGEXP_EXTRACT(lineRef, r'RUT:Line:(\d+)$') AS INT64) BETWEEN 1 AND 5 THEN 'metro'
      WHEN SAFE_CAST(REGEXP_EXTRACT(lineRef, r'RUT:Line:(\d+)$') AS INT64) BETWEEN 11 AND 19 THEN 'tram'
      ELSE 'bus' END AS mode,
    TIMESTAMP_TRUNC(COALESCE(aimedDepartureTime, aimedArrivalTime), HOUR, 'Europe/Oslo') AS h,
    (IFNULL(journeyCancellation, FALSE) OR IFNULL(stopCancellation, FALSE)) AS cancelled,
    IF(IFNULL(estimated, FALSE), NULL,
       TIMESTAMP_DIFF(COALESCE(departureTime, arrivalTime), COALESCE(aimedDepartureTime, aimedArrivalTime), SECOND) / 60.0) AS delayMin
  FROM `ent-data-sharing-ext-prd.realtime_siri_et.realtime_siri_et_last_recorded`
  WHERE operatingDate BETWEEN @d0 AND @d1
    AND dataSource IN ('RUT','VYG','FLT','GOA','SJN','BNR')
    AND (stopPointName LIKE 'Nationaltheatret%' OR stopPointName = 'Oslo S')
)
SELECT
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:00:00%Ez', h, 'Europe/Oslo') AS t,
  stop, mode,
  COUNT(*) AS calls,
  ROUND(AVG(IF(NOT cancelled, delayMin, NULL)), 2) AS meanDelay,
  ROUND(APPROX_QUANTILES(IF(NOT cancelled, delayMin, NULL), 10)[OFFSET(5)], 2) AS medDelay,
  ROUND(APPROX_QUANTILES(IF(NOT cancelled, delayMin, NULL), 10)[OFFSET(9)], 2) AS p90Delay,
  ROUND(SAFE_DIVIDE(COUNTIF(NOT cancelled AND delayMin > 5), COUNTIF(NOT cancelled AND delayMin IS NOT NULL)), 3) AS late5Share,
  COUNTIF(cancelled) AS cancelled
FROM calls
WHERE h IS NOT NULL AND (stop = 'NT' OR mode = 'rail')
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3
