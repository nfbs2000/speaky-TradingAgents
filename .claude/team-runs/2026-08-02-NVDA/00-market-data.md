# Repo-tool market data — NVDA @ 2026-08-01

> 저장소의 `@tool` 3개(`get_verified_market_snapshot`, `get_stock_data`,
> `get_indicators`)를 그대로 호출한 출력이다. 제품의 market_analyst가 쓰는
> 바로 그 툴이며, 벤더 라우팅·지표 계산·look-ahead 필터가 저장소 설정을
> 따른다. 이 파일의 어떤 수치에도 LLM이 관여하지 않았고, 러너가 가공한
> 값도 없다.
>
> **이 런에서 정확한 OHLCV·이동평균·RSI·MACD·Bollinger·ATR 수치의 source of
> truth는 이 파일이다.** 웹 출처가 다른 값을 주면 채택하거나 평균 내지 말고
> "web source mismatch"로만 기록한다.

## Tool: `get_verified_market_snapshot`

## Verified market data snapshot for NVDA

- Requested analysis date: 2026-08-01
- Latest trading row used: 2026-07-31
- Rows after the requested analysis date are excluded before verification.

### Latest verified OHLCV row

| Field | Value |
|---|---:|
| Open | 198.44 |
| High | 202.00 |
| Low | 194.95 |
| Close | 200.75 |
| Volume | 139659700 |

### Verified technical indicators (latest row)

| Indicator | Value |
|---|---:|
| close_10_ema | 200.15 |
| close_50_sma | 206.12 |
| close_200_sma | 192.93 |
| rsi | 48.31 |
| boll | 203.30 |
| boll_ub | 216.33 |
| boll_lb | 190.27 |
| macd | -1.94 |
| macds | -0.98 |
| macdh | -0.97 |
| atr | 7.47 |

### Recent verified closes (last 30 rows)

| Date | Close |
|---|---:|
| 2026-06-18 | 210.69 |
| 2026-06-22 | 208.65 |
| 2026-06-23 | 200.04 |
| 2026-06-24 | 199.00 |
| 2026-06-25 | 195.74 |
| 2026-06-26 | 192.53 |
| 2026-06-29 | 194.97 |
| 2026-06-30 | 200.09 |
| 2026-07-01 | 197.58 |
| 2026-07-02 | 194.83 |
| 2026-07-06 | 195.55 |
| 2026-07-07 | 196.93 |
| 2026-07-08 | 204.12 |
| 2026-07-09 | 202.78 |
| 2026-07-10 | 210.96 |
| 2026-07-13 | 203.53 |
| 2026-07-14 | 211.80 |
| 2026-07-15 | 212.50 |
| 2026-07-16 | 207.40 |
| 2026-07-17 | 202.81 |
| 2026-07-20 | 203.28 |
| 2026-07-21 | 207.29 |
| 2026-07-22 | 212.06 |
| 2026-07-23 | 208.76 |
| 2026-07-24 | 206.84 |
| 2026-07-27 | 196.51 |
| 2026-07-28 | 197.01 |
| 2026-07-29 | 190.01 |
| 2026-07-30 | 195.04 |
| 2026-07-31 | 200.75 |

Use this snapshot as the source of truth for exact OHLCV, price-level, and indicator-value claims. If another tool output conflicts with it, flag the discrepancy rather than inventing a reconciled number. Do not claim historical validation, support/resistance bounces, or exact percentage moves unless directly supported by tool output with concrete dates and prices.

---

## Tool: `get_stock_data` (2026-06-17 → 2026-08-01)

```csv
# Stock data for NVDA from 2026-06-17 to 2026-08-01
# Total records: 31
# Data retrieved on: 2026-08-02 14:37:40

Date,Open,High,Low,Close,Volume,Dividends,Stock Splits
2026-06-17,208.53,209.21,203.08,204.65,128363500,0.0,0.0
2026-06-18,207.33,211.39,206.5,210.69,241272000,0.0,0.0
2026-06-22,211.44,213.99,207.72,208.65,122041400,0.0,0.0
2026-06-23,202.17,203.77,200.0,200.04,153496200,0.0,0.0
2026-06-24,200.12,201.67,196.58,199.0,151810700,0.0,0.0
2026-06-25,200.08,200.8,192.13,195.74,149550000,0.0,0.0
2026-06-26,193.12,195.55,191.22,192.53,179304100,0.0,0.0
2026-06-29,193.85,196.18,189.8,194.97,148835700,0.0,0.0
2026-06-30,197.24,200.63,195.11,200.09,166476700,0.0,0.0
2026-07-01,196.2,199.85,193.45,197.58,146147600,0.0,0.0
2026-07-02,197.14,200.06,192.35,194.83,142068700,0.0,0.0
2026-07-06,194.42,197.55,193.99,195.55,108999000,0.0,0.0
2026-07-07,192.37,198.41,191.14,196.93,124154600,0.0,0.0
2026-07-08,195.18,205.16,195.06,204.12,147419100,0.0,0.0
2026-07-09,204.46,204.59,198.96,202.78,132037400,0.0,0.0
2026-07-10,202.0,211.0,201.92,210.96,148421000,0.0,0.0
2026-07-13,208.54,210.57,203.0,203.53,121411000,0.0,0.0
2026-07-14,208.2,212.55,203.8,211.8,124379600,0.0,0.0
2026-07-15,211.96,213.81,206.04,212.5,124797200,0.0,0.0
2026-07-16,210.17,211.08,205.85,207.4,122986100,0.0,0.0
2026-07-17,202.64,206.65,197.97,202.81,144281900,0.0,0.0
2026-07-20,205.87,207.74,202.28,203.28,88701500,0.0,0.0
2026-07-21,207.54,208.65,204.01,207.29,108685600,0.0,0.0
2026-07-22,205.81,214.39,204.95,212.06,137645600,0.0,0.0
2026-07-23,209.46,210.87,205.96,208.76,110505300,0.0,0.0
2026-07-24,207.45,211.91,204.81,206.84,114836800,0.0,0.0
2026-07-27,208.2,208.75,195.44,196.51,154353700,0.0,0.0
2026-07-28,195.0,198.7,192.74,197.01,134111500,0.0,0.0
2026-07-29,195.85,197.07,190.01,190.01,147680800,0.0,0.0
2026-07-30,193.45,197.25,191.52,195.04,129010200,0.0,0.0
2026-07-31,198.44,202.0,194.95,200.75,139659700,0.0,0.0

```

---

## Tool: `get_indicators` (repo DEFAULT_SNAPSHOT_INDICATORS, 30-day history)

## close_10_ema values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: 200.1470811819265
2026-07-30: 200.0130992223546
2026-07-29: 201.11823387484839
2026-07-28: 203.5867315121845
2026-07-27: 205.04822862448418
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 206.9456139839616
2026-07-23: 206.9690845719774
2026-07-22: 206.5711045864533
2026-07-21: 205.35135059264428
2026-07-20: 204.92054110520237
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: 205.2851060665147
2026-07-16: 205.83513017938603
2026-07-15: 205.4873826866975
2026-07-14: 203.9290232837414
2026-07-13: 202.17991666862667
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: 201.87989842181105
2026-07-09: 199.86209657913193
2026-07-08: 199.21367386798417
2026-07-07: 198.1233802570501
2026-07-06: 198.38857749733205
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: 199.01937181857076


10 EMA: A responsive short-term average. Usage: Capture quick shifts in momentum and potential entry points. Tips: Prone to noise in choppy markets; use alongside longer averages for filtering false signals.

## close_50_sma values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: 206.1238037109375
2026-07-30: 206.51586730957033
2026-07-29: 207.05629150390624
2026-07-28: 207.7572457885742
2026-07-27: 208.526357421875
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 209.1074996948242
2026-07-23: 209.38115936279297
2026-07-22: 209.5896502685547
2026-07-21: 209.64743988037108
2026-07-20: 209.72671569824217
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: 209.81287689208983
2026-07-16: 209.68210174560548
2026-07-15: 209.4990805053711
2026-07-14: 209.21346008300782
2026-07-13: 208.9642135620117
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: 209.0737417602539
2026-07-09: 209.112978515625
2026-07-08: 209.38453521728516
2026-07-07: 209.46268615722656
2026-07-06: 209.51223815917967
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: 209.6465234375


50 SMA: A medium-term trend indicator. Usage: Identify trend direction and serve as dynamic support/resistance. Tips: It lags price; combine with faster indicators for timely signals.

## close_200_sma values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: 192.92799606323243
2026-07-30: 192.86464668273925
2026-07-29: 192.8040802001953
2026-07-28: 192.8156537628174
2026-07-27: 192.7749493408203
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 192.71642082214356
2026-07-23: 192.6087390899658
2026-07-22: 192.50184410095216
2026-07-21: 192.38479110717773
2026-07-20: 192.2833486175537
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: 192.19866027832032
2026-07-16: 192.09270217895508
2026-07-15: 191.94551734924318
2026-07-14: 191.77033569335939
2026-07-13: 191.59505851745607
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: 191.46842208862304
2026-07-09: 191.33050262451172
2026-07-08: 191.19882736206054
2026-07-07: 191.05830497741698
2026-07-06: 190.92402038574218
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: 190.81955657958986


200 SMA: A long-term trend benchmark. Usage: Confirm overall market trend and identify golden/death cross setups. Tips: It reacts slowly; best for strategic trend confirmation rather than frequent trading entries.

## rsi values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: 48.30501696491868
2026-07-30: 43.09014850136645
2026-07-29: 37.9717888983572
2026-07-28: 42.965308436863886
2026-07-27: 42.46345517081382
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 51.08718975745741
2026-07-23: 52.94287054025793
2026-07-22: 56.20096660760382
2026-07-21: 52.25746898991689
2026-07-20: 48.64825538458324
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: 48.2222443054322
2026-07-16: 52.14515404272302
2026-07-15: 56.92288239338295
2026-07-14: 56.413907687308374
2026-07-13: 49.92287397745366
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: 57.00526236861677
2026-07-09: 49.71195186047394
2026-07-08: 51.02865765847492
2026-07-07: 43.58348190076522
2026-07-06: 42.01228340919358
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: 41.219173842217366


RSI: Measures momentum to flag overbought/oversold conditions. Usage: Apply 70/30 thresholds and watch for divergence to signal reversals. Tips: In strong trends, RSI may remain extreme; always cross-check with trend analysis.

## boll values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: 203.2964973449707
2026-07-30: 203.00049743652343
2026-07-29: 203.12749786376952
2026-07-28: 203.63149795532226
2026-07-27: 203.5294982910156
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 203.33049850463868
2026-07-23: 202.77549896240234
2026-07-22: 202.28749923706056
2026-07-21: 201.6864990234375
2026-07-20: 201.75449905395507
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: 202.12499923706054
2026-07-16: 202.21699905395508
2026-07-15: 202.21749954223634
2026-07-14: 202.21499938964843
2026-07-13: 201.88449935913087
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: 201.95149917602538
2026-07-09: 201.42449874877929
2026-07-08: 201.69499893188475
2026-07-07: 201.9209991455078
2026-07-06: 202.32949981689453
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: 203.4849998474121


Bollinger Middle: A 20 SMA serving as the basis for Bollinger Bands. Usage: Acts as a dynamic benchmark for price movement. Tips: Combine with the upper and lower bands to effectively spot breakouts or reversals.

## boll_ub values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: 216.32500551037128
2026-07-30: 216.53189715770816
2026-07-29: 216.3893050088553
2026-07-28: 215.4857528959153
2026-07-27: 215.65563448363133
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 216.057416830947
2026-07-23: 215.82211301945074
2026-07-22: 215.1199784907647
2026-07-21: 213.69105975723352
2026-07-20: 213.9071999040024
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: 214.90894738700752
2026-07-16: 215.04809955178723
2026-07-15: 215.0494520231484
2026-07-14: 215.03853313144788
2026-07-13: 213.988418483295
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: 214.1084881847421
2026-07-09: 212.8276516979907
2026-07-08: 213.48368900259754
2026-07-07: 214.07313707696255
2026-07-06: 214.32346453724648
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: 217.07549439072807


Bollinger Upper Band: Typically 2 standard deviations above the middle line. Usage: Signals potential overbought conditions and breakout zones. Tips: Confirm signals with other tools; prices may ride the band in strong trends.

## boll_lb values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: 190.26798917957012
2026-07-30: 189.4690977153387
2026-07-29: 189.86569071868374
2026-07-28: 191.7772430147292
2026-07-27: 191.4033620983999
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 190.60358017833036
2026-07-23: 189.72888490535394
2026-07-22: 189.4550199833564
2026-07-21: 189.6819382896415
2026-07-20: 189.60179820390775
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: 189.34105108711356
2026-07-16: 189.38589855612292
2026-07-15: 189.38554706132427
2026-07-14: 189.39146564784897
2026-07-13: 189.78058023496675
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: 189.79451016730866
2026-07-09: 190.02134579956788
2026-07-08: 189.90630886117196
2026-07-07: 189.76886121405306
2026-07-06: 190.33553509654257
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: 189.89450530409613


Bollinger Lower Band: Typically 2 standard deviations below the middle line. Usage: Indicates potential oversold conditions. Tips: Use additional analysis to avoid false reversal signals.

## macd values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: -1.94435635011655
2026-07-30: -2.1071303461013144
2026-07-29: -1.702857485075782
2026-07-28: -0.6499441396918257
2026-07-27: -0.009317373188025613
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 0.8593999523958757
2026-07-23: 0.9039167894898696
2026-07-22: 0.7520978583318936
2026-07-21: 0.21138177935372937
2026-07-20: 0.00382995677244935
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: 0.14715299909349255
2026-07-16: 0.3757995810498471
2026-07-15: 0.19482450643729976
2026-07-14: -0.5582726576107007
2026-07-13: -1.4401057463365987
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: -1.7026616428039745
2026-07-09: -2.769522352828716
2026-07-08: -3.258067071517445
2026-07-07: -3.970673709461437
2026-07-06: -4.09039067935646
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: -4.043188440240357


MACD: Computes momentum via differences of EMAs. Usage: Look for crossovers and divergence as signals of trend changes. Tips: Confirm with other indicators in low-volatility or sideways markets.

## macds values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: -0.9786867864524135
2026-07-30: -0.7372693955363792
2026-07-29: -0.39480415789514517
2026-07-28: -0.0677908260999858
2026-07-27: 0.07774750229797425
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 0.09951372116947421
2026-07-23: -0.09045783663712624
2026-07-22: -0.3390514931688753
2026-07-21: -0.6118388310440676
2026-07-20: -0.8176439836435168
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: -1.0230124687475084
2026-07-16: -1.3155538357077585
2026-07-15: -1.73839218989716
2026-07-14: -2.221696363980775
2026-07-13: -2.6375522905732933
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: -2.9369139266324664
2026-07-09: -3.245476997589589
2026-07-08: -3.364465658779807
2026-07-07: -3.391065305595397
2026-07-06: -3.246163204628887
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: -3.035106335946993


MACD Signal: An EMA smoothing of the MACD line. Usage: Use crossovers with the MACD line to trigger trades. Tips: Should be part of a broader strategy to avoid false positives.

## macdh values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: -0.9656695636641365
2026-07-30: -1.3698609505649353
2026-07-29: -1.308053327180637
2026-07-28: -0.58215331359184
2026-07-27: -0.08706487548599987
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 0.7598862312264015
2026-07-23: 0.9943746261269959
2026-07-22: 1.0911493515007689
2026-07-21: 0.8232206103977969
2026-07-20: 0.8214739404159661
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: 1.170165467841001
2026-07-16: 1.6913534167576056
2026-07-15: 1.9332166963344597
2026-07-14: 1.6634237063700743
2026-07-13: 1.1974465442366946
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: 1.234252283828492
2026-07-09: 0.47595464476087335
2026-07-08: 0.10639858726236229
2026-07-07: -0.5796084038660396
2026-07-06: -0.8442274747275733
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: -1.0080821042933636


MACD Histogram: Shows the gap between the MACD line and its signal. Usage: Visualize momentum strength and spot divergence early. Tips: Can be volatile; complement with additional filters in fast-moving markets.

## atr values from 2026-07-02 to 2026-08-01:

2026-08-01: N/A: Not a trading day (weekend or holiday)
2026-07-31: 7.473749336847215
2026-07-30: 7.506345204931015
2026-07-29: 7.5268328750669315
2026-07-28: 7.5627421102734
2026-07-27: 7.686030622211501
2026-07-26: N/A: Not a trading day (weekend or holiday)
2026-07-25: N/A: Not a trading day (weekend or holiday)
2026-07-24: 7.253417780951327
2026-07-23: 7.265218679215614
2026-07-22: 7.354851589560926
2026-07-21: 7.1944553701882095
2026-07-20: 7.334798466572877
2026-07-19: N/A: Not a trading day (weekend or holiday)
2026-07-18: N/A: Not a trading day (weekend or holiday)
2026-07-17: 7.479013216781005
2026-07-16: 7.328937873780983
2026-07-15: 7.381164333573029
2026-07-14: 7.35125356904319
2026-07-13: 7.222888130318748
2026-07-12: N/A: Not a trading day (weekend or holiday)
2026-07-11: N/A: Not a trading day (weekend or holiday)
2026-07-10: 7.166186700815022
2026-07-09: 7.018970152335047
2026-07-08: 7.125814808359015
2026-07-07: 6.897030862577741
2026-07-06: 6.868340600279036
2026-07-05: N/A: Not a trading day (weekend or holiday)
2026-07-04: N/A: Not a trading day (weekend or holiday)
2026-07-03: N/A: Not a trading day (weekend or holiday)
2026-07-02: 7.122828526562522


ATR: Averages true range to measure volatility. Usage: Set stop-loss levels and adjust position sizes based on current market volatility. Tips: It's a reactive measure, so use it as part of a broader risk management strategy.
