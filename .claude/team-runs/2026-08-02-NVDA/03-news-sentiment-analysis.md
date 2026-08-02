# News & Sentiment Analysis — NVDA @ 2026-08-01

- 기준가: verified close **$200.75** (2026-07-31), source of truth는 `00-market-data.md`
- 분석 시점: 2026-08-01 (라이브 웹 조사는 2026-08-02 수행)
- 다음 촉매: **FY2027 Q2 실적 2026-08-26** (분기 종료 7/26, 발표 13:20 PT / 콜 14:00 PT)

> 가격·거래량 수치는 전부 `00-market-data.md`의 verified OHLCV에서 왔고, 변동률은 거기서
> 직접 계산했다. 웹 기사가 다른 값을 제시하면 채택하지 않고 "web source mismatch"로만
> 기록한다. 소셜 수치는 출처와 표본 크기를 병기하며, 내가 직접 읽은 게시물과 제3자
> 집계값을 구분해 표기했다.

---

## 1. 가격 반응과 뉴스 사건 대조 (7/24 → 7/31)

| 날짜 | 종가 | 변동률 | 거래량 | 대응 사건 |
|---|---:|---:|---:|---|
| 2026-07-24 (금) | 206.84 | — | 114.8M | SK그룹 **$500B+** AI 인프라 파트너십 LOI 발표 |
| 2026-07-27 (월) | 196.51 | **-5.00%** | **154.4M** | OpenAI **$250B 백스톱** 보도 → 순환 금융 우려 |
| 2026-07-28 (화) | 197.01 | +0.25% | 134.1M | 소강. ARK 저가매수, Bernstein PT $315 유지 |
| 2026-07-29 (수) | **190.01** | -3.55% | 147.7M | 반도체 전반 매도, 하이퍼스케일러 capex ROI 회의론 |
| 2026-07-30 (목) | 195.04 | +2.65% | 129.0M | MSFT/Meta capex 유지 확인, 반도체 급반등 |
| 2026-07-31 (금) | **200.75** | +2.93% | 139.7M | AMZN capex $220B 상향 + AWS의 NVDA 유지 재확인 |

고점→저점: 7/24 $206.84 → 7/29 $190.01 = **-8.14%**.
저점→종점: 7/29 $190.01 → 7/31 $200.75 = **+5.65%**.

verified 데이터에서만 보이는 세 가지:

1. **7/27 거래량 154.4M은 7월 전체 최대치**다 (차순위 7/29 147.7M, 7/17 144.3M). 뉴스
   충격이 실제 거래량으로 확인된다 — 조용한 드리프트가 아니었다.
2. **7/29는 종가와 당일 저가가 $190.01로 동일하다.** 저점 마감이며, 같은 날 Bollinger
   하단($189.87) 바로 위였다. 항복성 마감의 형태다.
3. **반등 이틀(7/30 129.0M, 7/31 139.7M)의 거래량이 급락일보다 적다.** 되돌림이 급락만큼의
   확신을 동반하지는 않았다는 뜻이다.

### 이번 창의 가장 중요한 관찰

**$500B+ 호재가 하루 만에 $250B 악재에 완전히 압도됐다.** SK그룹 파트너십(7/24, 금)은
규모로만 보면 이 창 최대의 수요 뉴스인데, 바로 다음 거래일 주가는 -5.00% 빠졌다. 두 뉴스는
금액대가 같고 둘 다 Nvidia가 벤더 인접 금융에 관여하는 구조다. 시장이 전자를 무시하고
후자에 반응했다는 것은, **현재 질문이 "수요가 있는가"가 아니라 "그 수요의 자금 조달이
건전한가"로 이동했음**을 보여준다. 수요 헤드라인의 주가 탄력이 떨어져 있다는 신호다.

### Web source mismatch (기록만, 채택하지 않음)

| 날짜 | 웹 보도 | verified |
|---|---|---|
| 2026-07-27 | TipRanks "down over 4%", TradingKey "-3.46%", Yahoo "nearly 5%" | **-5.00%** |
| 2026-07-29 | TradingKey "closed down 3.42%", "traded at $195.47" | 종가 **$190.01**, **-3.55%** |
| 2026-07-31 | TradingKey "Closed Up by 3.46%" | **+2.93%** |
| 2026-07-31 | 이전 런 리포트 인용 종가 $198.97 | **$200.75** |

TradingKey 계열 수치는 3건 모두 verified와 어긋난다. 해당 매체 수치는 사용하지 않았고
사건 서술에만 참조했다.

---

## 2. 주요 뉴스 (날짜·출처 명시)

### 2-1. SK그룹 $500B+ 파트너십 (2026-07-24)

SK그룹과 NVIDIA가 **$500B 초과** 규모 AI 인프라 파트너십 **LOI**를 체결했다. SK텔레콤이
**2GW NVIDIA Vera Rubin DSX AI Factory**를 구축하고, SK하이닉스와는 HBM4 등 차세대 AI
메모리의 장기 공급·공동개발 파트너십을 맺는다. **첫 시설 가동은 2027년**이다.
출처: [NVIDIA Newsroom](https://nvidianews.nvidia.com/news/sk-group-and-nvidia-expand-strategic-partnership-across-ai-factories-and-next-generation-memory), [Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/nvidia-sk-group-unveil-500-235343258.html), [DCD](https://www.datacenterdynamics.com/en/news/nvidia-and-sk-group-announce-500bn-ai-agreement-includes-2gw-of-data-center-capacity/)

**성격 구분이 중요하다**: 확정 계약이 아닌 **LOI**이고, 매출 기여는 **2027년 이후**다.
규모는 크지만 근시일 실적 가시성은 낮은 사건이다.

### 2-2. 핵심 악재 — OpenAI $250B 백스톱 (2026-07-27)

Nvidia가 OpenAI의 오하이오 Pike County **10GW** 데이터센터 캠퍼스 자금조달에 **약 $250B
금융 보증(backstop)**을 논의 중이라는 보도. 보증 대상은 **리스와 건설 부채**이며 시설
내부 반도체 자체는 아니다. 별도로 실리콘 관련 **$350B 금융**이 함께 논의돼 전체 프로젝트
규모는 $500B를 넘는다.
출처: [Axios](https://www.axios.com/2026/07/27/nvidia-openai-financing-ai-jensen-huang-ssi), [Yahoo Finance](https://finance.yahoo.com/markets/article/nvidia-drops-nearly-5-leading-chip-stocks-lower-amid-renewed-worries-of-circular-financing-193309793.html), [Benzinga](https://www.benzinga.com/trading-ideas/movers/26/07/60701139/nvidia-stock-falls-5-how-credit-risk-sharing-is-impacting-the-ai-trade)

시장이 문제 삼은 지점은 규모가 아니라 **구조**다. OpenAI는 투자등급 신용등급이 없어 이
규모의 물리적 데이터센터 리스를 자체 신용으로 확보할 수 없고, 따라서 외부 대차대조표가
필요하다. 그 대차대조표를 최종 수요자인 Nvidia가 대는 형태가 되면서 "AI 수요가 기대에 못
미칠 경우 손실이 밸류체인 전체에서 증폭된다"는 우려가 재점화됐다. Michael Burry가
"Around and around we go"라고 논평했다 ([Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/nvidia-reportedly-moves-backstop-250-015059079.html)).

**같은 날 섹터 파급**: AMD -5% 초과, Micron -2% 초과, SK Hynix -7%. Apple이 Nvidia를 제치고
시가총액 1위로 올라섰다.

**중요**: 이 건은 **보도 단계**이며 Nvidia의 공식 확인이나 확정 조건은 확인되지 않았다.

### 2-3. 반도체 전반 매도 (2026-07-29)

[CNBC](https://www.cnbc.com/2026/07/29/chip-selloff-sk-hynix-samsung-softbank.html)는 반도체
종목군에서 **$1T 이상이 증발**했다고 보도했다 (SK Hynix, Samsung, SoftBank 포함). 원인은
개별 기업 실적 훼손이 아니라 **하이퍼스케일러 capex의 투자수익 회수 시점에 대한 회의론**
이었다. 즉 수요 붕괴의 증거가 아니라 지속가능성 의심이 가격에 반영된 국면이다.

같은 날 Seaport의 Jay Goldberg가 Nvidia 가격정책의 모순을 지적하는 노트를 냈고, 반대편
에서 BofA는 매수 의견을 유지했다.

### 2-4. 반전을 만든 지점 (2026-07-30 ~ 07-31)

- **7/30**: Microsoft Azure 강세 및 2026년 capex 가이던스 유지, Meta의 AI 투자계획 재확인
  ([Yahoo Finance](https://finance.yahoo.com/news/nvidia-stock-rises-to-lead-chip-rally-after-meta-microsoft-back-ai-investment-plans-124324390.html), [invezz](https://invezz.com/au/news/2026/07/30/why-nvidia-stock-is-rebounding-around-3percent-after-big-tech-earnings/)).
  Intel +11.3%, AMD +13%, 필라델피아 반도체지수 +8%, 나스닥 종합 +2.8% — **NVDA 고유 호재가
  아니라 섹터 전체 되돌림**이었다.
- **7/31**: Amazon이 capex를 **$220B로 상향**하며 AWS가 Nvidia 칩을 계속 중심에 둘 것이라고
  재확인 ([invezz](https://invezz.com/news/2026/07/31/why-nvidia-stock-is-rebounding-another-2-on-friday/)).
  Trainium 등 자체 실리콘이 Nvidia를 대체한다는 우려를 직접 겨냥해 해소한 발언이라 7/30보다
  반등의 질이 낫다. 시가총액 약 **$4.86T**로 1위 탈환.

**하락은 Nvidia 고유의 금융구조 이슈에서, 반등은 고객사의 지출 확약에서 왔다.** 두 축이
서로 다른 사안이므로 **백스톱 이슈는 해소된 것이 아니라 미뤄진 상태**다.

### 2-5. 기타 사건

| 날짜 | 사건 | 출처 |
|---|---|---|
| 2026-07-30 | Q2 FY2027 실적 컨퍼런스콜 **8/26** 확정 | [StockTitan](https://www.stocktitan.net/news/NVDA/nvidia-sets-conference-call-for-second-quarter-financial-t2wo8k69dark.html) |
| 2026-07-30 | Morningstar(Brian Colello): FV **$280** 유지, "undervalued", FY2027 매출 +80% 모델링 | [Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/nvidia-stock-rises-1-8-191852909.html) |
| 2026-07-14~15 | 중국 H200 선적 개시 확인, 다만 상무부 차관 Jeffrey Kessler가 물량을 **"trivial"**로 표현 | [Bloomberg](https://www.bloomberg.com/news/articles/2026-07-14/small-amount-of-nvidia-ai-chips-shipped-to-china-with-us-license), [ChinaTechNews](https://www.chinatechnews.com/2026/07/15/125588-us-says-nvidias-h200-exports-to-china-remain-trivial-despite-approvals) |
| 2026-07-09 | 중국 승인 물량 20만장 미만 전망 (요청분의 절반 미만) | [TrendForce](https://www.trendforce.com/news/2026/07/09/news-china-reportedly-to-allow-nvidia-h200-imports-but-approvals-may-be-capped-below-200k-chips-less-than-half-requested/) |

**중국 H200 요약**: 미국이 약 10개 중국 기업(Alibaba, Tencent, ByteDance, JD.com 등)에 사당
최대 75,000장 구매를 승인했으나 실제 선적은 미미하다. 중국 기업 2026년 주문은 200만장 초과인
반면 Nvidia 재고는 약 70만장으로 보도됐다. **Blackwell은 여전히 대중국 직수출 금지**. 7월 말
급락과는 무관한 별개 축이며, 현재로선 실적 기여보다 옵션 가치에 가깝다.

---

## 3. 애널리스트 등급 및 목표주가

### 3-1. 개별 액션 (2026-07-14 ~ 07-31)

| 날짜 | 기관 | 애널리스트 | 액션 | 등급 | 목표주가 |
|---|---|---|---|---|---:|
| 2026-07-31 | Wells Fargo | Aaron Rakers | Reiterate | — | $315 |
| 2026-07-30 | Morningstar | Brian Colello | FV 유지 | Undervalued | $280 (FV) |
| 2026-07-28 | Bernstein | Stacy Rasgon | Maintain | — | $315 |
| 2026-07-27 | BofA Securities | Vivek Arya | Maintain | — | $350 |
| 2026-07-22 | DZ Bank | Ingo Wermann | Maintain | — | n/a |
| 2026-07-22 | Truist Financial | William Stein | Reiterate | — | n/a |
| 2026-07-14 | KeyBanc | John Vinh | Maintain | Overweight | $310 → **$330** |

출처: [stockanalysis.com](https://stockanalysis.com/stocks/nvda/forecast/) (2026-08-01 조회),
[Benzinga](https://www.benzinga.com/quote/NVDA/analyst-ratings). 등급 텍스트가 공개되지 않은
항목은 `—`로 두었고 추정하지 않았다.

**이 창의 핵심 사실: 다운그레이드가 한 건도 없다.** 주가가 5거래일 만에 -8.14% 빠지는 동안
목표주가는 내려오지 않았다. 급락 당일과 직후에 BofA($350, 7/27), Bernstein($315, 7/28)이
기존 수준을 재확인했고, 반등 마지막 날 Wells Fargo($315, 7/31)가 재확인했다. KeyBanc는 급락
이전인 7/14에 오히려 $310 → $330으로 **상향**했다.

검색 과정에서 잡힌 HSBC 목표가 하향($320 → $310, Buy 유지)은 **2026-02-24 건으로 이번 창
밖**이라 제외했다. 2025년 4월 HSBC 다운그레이드 건도 동일하게 제외했다. 이전 런이 언급한
Deutsche Bank PT $220 건은 이번에도 날짜를 확정하지 못해 제외했다.

### 3-2. 컨센서스

| 출처 | 기준일 | 애널리스트 수 | 평균 목표가 | 레인지 | 등급 |
|---|---|---:|---:|---|---|
| stockanalysis.com | 2026-08-01 조회 | 61 | **$302.83** | $180 – $500 | Strong Buy |
| MarketBeat | 2026-07-21 | 53 | $304.26 | $218 – $500 | Buy |
| TickFlow | 2026-07 | 67 | $316.79 | n/a | n/a |

verified close $200.75 기준 평균 목표가까지 약 **+50.9%** 괴리. 다만 레인지 하단 $180은
현재가 아래이며, 커버리지 내부에도 실질적 약세 견해가 존재함을 뜻한다. 집계 서비스별로
애널리스트 수(53/61/67)와 평균값이 달라 **컨센서스를 정밀 수치로 다루면 안 된다.**

**해석 주의**: 목표주가 컨센서스는 후행적이고 구조적으로 상방 편향돼 있다. "평균 $303 대
현재 $201"을 상승 여력으로 읽는 것은 위험하다. 여기서 유의미한 정보는 목표가의 절대 수준이
아니라 **급락에도 하향이 없었다는 사실 자체**다.

---

## 4. 소셜 센티먼트

### 4-1. Reddit — 실제 집계 건수 (ApeWisdom API 직접 조회, 2026-08-02)

ApeWisdom API를 직접 호출해 얻은 원수치다.

| 범위 | 멘션 | 추천(upvotes) | 24h 전 멘션 | 변화 | 랭크 (24h 전) |
|---|---:|---:|---:|---:|---|
| 전체 추적 서브레딧 | **34** | **154** | 136 | **-75.0%** | 7위 (9위) |
| r/wallstreetbets | **21** | **121** | 126 | **-83.3%** | 9위 (9위) |

센티먼트: 전체 67% positive, r/wallstreetbets 77% positive (33명 / 20명 발화).

**이 데이터로는 개인투자자 방향을 판정할 수 없다. 두 가지 이유가 있다.**

1. **표본이 노이즈 범위다.** WSB 21건 중 77% positive는 약 16 대 5다. 이 정도 건수로 방향을
   말하면 안 된다. 전체 34건 / 추천 154개도 마찬가지다. 참고로 이 리포트가 쓰는 기준선은
   "추천 400 / 댓글 200급 스레드는 관심, 추천 3짜리는 노이즈"인데, **34건 전체의 추천 합이
   154**다.
2. **조회 시점이 주말이다 (핵심).** 오늘은 2026-08-02(일)이고 8/1은 토요일이다
   (`00-market-data.md`가 두 날짜를 non-trading day로 표기). 즉 trailing 24h 창이 통째로
   주말이다. **따라서 멘션 -75%는 개인투자자의 관심 소멸이 아니라 달력 효과일 가능성이
   높다.** 실제로 같은 기간 NVDA의 **랭크는 9위 → 7위로 올랐다** — 게시판 전체 활동이
   줄었을 뿐 NVDA의 상대적 존재감은 오히려 커졌다는 뜻이다.

> 이전 런 리포트는 동일한 -75% 수치를 "무관심 국면(apathy)"으로 해석했다. **이번 런에서는
> 그 해석을 채택하지 않는다.** 랭크 상승과 주말 창이라는 두 사실이 그 해석과 배치된다.

### 4-2. Reddit — 제3자 톤 집계 (adanos.org, 7일 창, 기준 2026-07-27)

| 지표 | 값 |
|---|---|
| Reddit 멘션 (7일) | 2,243건 |
| 추적 서브레딧 | 52개 |
| 강세 / 중립 / 약세 | **29% / 50% / 20%** |
| 방향성 지수 | +0.0 (Stable) |
| 전체 소스 대비 비중 | 2,243 / 10,476 ≈ 21% |
| 참고: X(Twitter) / 뉴스 / Polymarket | 5,963건 / 223건(82% 강세) / 2,047 거래 |

표본 2,243건은 방향을 논하기에 충분한 크기지만, **두 가지 결함 때문에 낮은 신뢰도를 부여
한다**:

1. **내부 모순.** 같은 페이지가 r/wallstreetbets를 "이번 주 최다 발언 venue, **5,239건**"
   으로 표기하는데, 이는 Reddit 총계 2,243건을 **초과**한다. 산술적으로 불가능하다. 따라서
   **서브레딧별 분해는 사용 불가**로 판단했고, 어느 커뮤니티(WSB의 과열·역발상 성향 대
   r/investing의 장기 관점)에서 어떤 톤이 나왔는지는 **판정할 수 없다**.
2. **시점 불일치.** 창이 **7/27에 닫힌다.** 급락 당일은 포착했으나 **7/30~31 반등을 전혀
   반영하지 않는다.** 구조적으로 약세 편향된 스냅샷이다.

29% 강세 대 20% 약세는 표면상 강세 우위이나, 중립 50%가 지배적이고 방향성 지수가 정확히
+0.0이다. 실질적으로 **방향 없음**에 가깝다.

### 4-3. StockTwits

| 지표 | 값 | 기준일 | 출처 |
|---|---|---|---|
| 센티먼트 스코어 | **73 / 100 (Neutral)** | 2026-08-01 | AltIndex |
| 일일 멘션 | **8,110건/일** (+1.2%) | 2026-08-01 | AltIndex |
| 7월 월평균 | 6,842건 (+8.7% MoM) | 2026-07 | AltIndex |
| 6월 / 5월 월평균 | 7,496건 / 9,989건 | — | AltIndex |
| 동종 비교 | AMD 3,756건, INTC 3,840건 | 2026-08-01 | AltIndex |
| StockTwits 자체 판독 | 'neutral' → **'bullish'** 상향, chatter 'high' | 2026-07-31 | StockTwits |

**여기는 표본이 충분하다** — 일 8,000건대는 노이즈가 아니다. 멘션량이 AMD·INTC의 2배 이상
이고 7월 월평균이 전월비 +8.7%로 늘어, 급락이 관심을 끌어올렸다는 해석과 정합적이다. 다만
**스코어 73/100은 여전히 "Neutral" 구간**이며, StockTwits 자체 서술('bullish로 상향')과
AltIndex 스코어(Neutral) 사이에 톤 차이가 있다. StockTwits 공식 API는 직접 접근이 차단돼
(Cloudflare) 원본 메시지 단위 검증은 하지 못했다.

### 4-4. 사건 대 의견 구분

무게가 다른 입력을 섞지 않기 위해 정리한다.

- **사건(검증 가능)**: SK그룹 LOI, OpenAI $250B 백스톱 협상 보도, Amazon capex $220B 상향,
  8/26 실적콜 확정, H200 선적 개시, ARK의 7/28 매수, 애널리스트 목표가 유지.
- **의견(가중치 낮음)**: Michael Burry 논평, Morningstar $280 FV, Seaport의 가격정책 비판,
  StockTwits/Reddit 톤 판독.

7월 말 가격을 실제로 움직인 것은 **보도된 사건**이지 소셜 톤이 아니다. 소셜 지표는 이번
창에서 선행하지도 증폭하지도 않았다.

---

## 5. 내부자 거래

| 기간/날짜 | 주체 | 거래 | 규모 | 출처 |
|---|---|---|---|---|
| 2026-07-08 ~ 07-10 | Jensen Huang (CEO) | 매도 | **205,618주** | Form 4 |
| 2026-06-17 | 최고위 임원 5인 (CEO·CFO 포함) | 매도 | 합계 약 **$40.3M** | [Kresmion](https://kresmion.com/daily-brief/2026-06-26) |
| 최근 3개월 | 내부자 전체 | 매도 $410.6M / **매수 0건** | — | [TECHi](https://www.techi.com/nvidia-insider-selling/) |
| 최근 18개월 | 내부자 15명 | 누적 매도 **$3.3B+** (Huang 약 $2.9B) | 전량 Rule 10b5-1 | [TECHi](https://www.techi.com/nvidia-insider-selling/) |

- Huang 잔여 보유는 약 **8.6억 주(발행주식 약 3.5%)**로, 매도분은 전체 포지션의 한 자릿수
  비율에 그친다.
- 매도는 **Rule 10b5-1 사전계획**에 따른 것으로 보도됐다. 사전 설정 일정 매도이므로
  **개별 건을 경영진의 시황 판단 신호로 읽으면 안 된다.**
- 다만 **18개월간 매수 0건**은 약한 약세 데이터포인트다. 단, AI 하드웨어 업계 전반에서
  내부자 매수가 사실상 소멸했다는 집계가 있어(Kresmion, 2026-06-26) **NVDA 고유 현상으로
  보기는 어렵다** — 섹터 차원의 현상이다.
- **7/20~7/31 창의 Form 4는 확인하지 못했다.** 급락 국면에서의 내부자 대응은 판정 불가.

---

## 6. 기관 보유 지분 변동

| 날짜 | 주체 | 거래 | 규모 |
|---|---|---|---|
| **2026-07-28** | ARK Invest (5개 ETF) | **매수** | **78,965주 / 약 $15.6M** |
| 2026-06 (월중) | ARK Invest | 매수 | 약 $63.3M |
| 2026-06-01 | ARK Invest | 매수 | 300,017주 |
| 2026-05-18 | ARK Invest | 매수 | 5,409주 |

ARK의 7/28 매수는 **급락 직후 저가매수**로 명시 보도됐고, 같은 기간 AMD를 축소해 섹터 내
비중을 NVDA로 옮긴 성격이다 ([Seeking Alpha](https://seekingalpha.com/news/4599535-cathie-wood-loads-up-on-nvidia-cuts-amd-across-flagship-ark-funds), [TheStreet](https://www.thestreet.com/investing/cathie-wood-buys-14-3-million-of-tumbling-semiconductor-stock-nvidia-nvda)).
다만 ARK는 운용규모 대비 신호 가치가 제한적이고 2023년 1월 NVDA 전량 매도 이력이 있다 —
**단일 운용사의 행동을 기관 전반의 대리 지표로 쓰면 안 된다.**

**광범위한 기관 데이터는 사용 불가다.** 확인 가능한 13F 집계는 **2026-03-31 종료 분기(Q1)**
기준이고, Q2(6/30 종료) 13F는 제출 기한이 8월 중순이라 미반영이다. **7월 급락 국면의 기관
포지셔닝 변화는 이 리포트로 판정 불가.** 상위 보유자는 Vanguard·BlackRock·State Street·
FMR·Geode 등 인덱스 중심으로 구조적 변화는 없다.

참고로 NVIDIA 자체 13F 포트폴리오에서 CoreWeave 보유를 24.28M → 47.21M주(+95%)로 확대한
건이 보도됐다 ([Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/deep-dive-nvidia-latest-portfolio-180500743.html)).
시장이 우려하는 **"공급자↔고객 상호출자" 구조의 실례**이며, 백스톱 논쟁과 같은 맥락에
놓인다.

---

## 7. 섹터 전반 뉴스·트렌드

1. **AI capex 지속성이 단일 최대 변수다.** 7월 말 하락과 반등이 모두 하이퍼스케일러 지출
   전망에서 나왔다. 보도된 2026년 capex: Amazon 약 $220B(상향), Alphabet $195~205B,
   Microsoft 약 $175B, Meta $130~145B. NVDA는 사실상 이 숫자들의 레버리지 포지션이다.
2. **순환 금융 논쟁은 미해소다.** 7/30~31 반등은 고객사 지출 확약에서 왔을 뿐 백스톱 구조
   자체에 답이 나온 것이 아니다. 확정 발표나 조건 공개 시 재점화 가능.
3. **섹터 베타가 매우 높다.** 7/30 하루에 Intel +11.3%, AMD +13%, SOX +8%. 개별 종목 분석
   만으로 설명되지 않는 구간이다.
4. **중국은 옵션이지 현재 실적이 아니다.** H200 승인은 있으나 선적은 "trivial", Blackwell은
   금지, 수요(200만장+) 대비 재고(약 70만장) 병목.
5. **수요 내러티브는 살아 있으나 주가 탄력을 잃었다.** SK $500B LOI와 별개로 총 $750B 규모
   신규 AI 딜 추진 보도가 있으나 ([Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/nvidia-pursues-750-billion-ai-205709197.html)),
   7/24 SK 발표 직후 -5% 급락이 보여주듯 시장은 이런 헤드라인에 더 이상 값을 매기지 않는다.
6. **8/26 실적이 다음 분기점이다.** 아래 괴리들이 실제로 정산되는 날짜다.

---

## 8. 출처 간 괴리 — 이번 런의 핵심 발견

평균으로 뭉개지 않고 그대로 적는다.

| 소스 | 방향 | 근거 |
|---|---|---|
| 뉴스 프레이밍 (7/27~29) | **약세** | 순환 금융 우려, 반도체 $1T 증발, 시총 1위 상실 |
| 뉴스 프레이밍 (7/30~31) | **강세** | 하이퍼스케일러 capex 확약, 시총 1위 탈환 |
| 셀사이드 애널리스트 | **강세 (무변동)** | 다운그레이드 0건, PT 유지·상향, 평균 $302.83 |
| 개인투자자 — Reddit 톤 (~7/27) | **방향 없음** | 29/50/20, 방향성 +0.0, 데이터 결함 있음 |
| 개인투자자 — Reddit 건수 (8/1~2) | **판정 불가** | 34건/추천 154 = 노이즈, 주말 창 |
| 개인투자자 — StockTwits (7/31~8/1) | **중립~강세** | 73/100, 'bullish' 상향, 8,110건/일 |
| 내부자 | **약한 약세** | 18개월 매수 0건 (단, 10b5-1 + 섹터 공통 현상) |
| 기관 (ARK만 관측) | **강세** | 7/28 급락일 매수, AMD → NVDA 이동 |

**괴리 1 — 가격과 셀사이드의 정면 불일치 (가장 중요).** 주가가 8% 넘게 빠지는 동안 목표
주가는 한 건도 내려오지 않았다. 두 해석이 가능하고 현재 데이터로 구분 불가다: (a) 셀사이드가
백스톱을 실적 훼손 요인이 아니라고 판단했다, (b) 아직 반영하지 않았을 뿐이며 8/26 이후
조정될 수 있다. **이 미해소 자체가 리스크의 소재다.**

**괴리 2 — 내부자와 기관의 반대 방향.** 내부자는 매도 일변도, ARK는 급락일 매수. 단 양쪽
모두 신호 강도가 약하다 (10b5-1 사전계획 / 단일 운용사).

**괴리 3 — 소셜 소스 간 시점차.** Reddit 톤 판독은 7/27에 닫히고 StockTwits는 7/31~8/1을
담는다. **둘의 차이가 진짜 견해차인지 단순 시점차인지 구분할 수 없다.** "Reddit이 더
약세"로 해석하면 안 된다.

---

## Sentiment Direction: **Mixed**

출처들이 실제로 서로 다른 방향을 가리키고 있어 하나로 뭉개지 않는다. 뉴스 플로우 자체가
한 주 안에서 방향을 바꿨다 — 7/27~29는 OpenAI $250B 백스톱발 순환 금융 우려로 확실히
약세였고 verified 가격이 이를 확인했다(7/24 $206.84 → 7/29 $190.01, **-8.14%**, 7/27 거래량
154.4M은 7월 최대, 7/29는 당일 저가에 마감). 7/30~31은 반대로 강세였으나 그 동력은 Nvidia
고유 호재가 아니라 Amazon capex $220B 상향과 AWS의 Nvidia 유지 재확인이라는 **고객사 측
확약**이었으므로, 하락을 만든 백스톱 구조 문제는 해소가 아니라 유예 상태다. 셀사이드는 그
사이 미동도 하지 않았다 — **이 창에서 다운그레이드 0건**이고 BofA $350·Bernstein $315·
Wells Fargo $315가 급락 전후로 재확인됐으며 KeyBanc는 7/14에 $330으로 올렸다. 개인투자자
판독은 어느 방향도 지지하지 않는다: StockTwits는 표본이 충분함에도(8,110건/일) 73/100
Neutral이고, Reddit은 톤 집계가 방향성 +0.0이며 건수 집계는 34건/추천 154로 노이즈 범위라
**판정 자체가 불가**하다. 특히 이번 창에서 가장 시사적인 사실은, 규모가 대등한 $500B+ SK
파트너십(7/24)이 발표 직후 -5% 급락에 완전히 묻혔다는 점이다 — 시장의 질문이 "수요가
있는가"에서 **"그 수요의 자금 조달이 건전한가"**로 옮겨갔다는 신호다. 종합하면 이 국면의
성격은 방향성 합의가 아니라 **실적 훼손 증거 없이 진행 중인 구조 리스크 재평가이며, 시장·
셀사이드·개인투자자가 아직 값을 맞추지 못한 상태**다. 정산 시점은 8/26 실적일 가능성이
높다. 과거 센티먼트는 예측력이 없으므로 이 판정은 트레이더가 저울질할 하나의 입력일 뿐
가격 전망이 아니다.

---

## Data Gaps

1. **소셜 게시물 원문 접근 불가.** reddit.com은 직접 요청 시 JS 셸만 반환하고 검색
   에이전트는 도메인 차단, StockTwits API는 Cloudflare 챌린지. **개별 게시물·메시지 본문을
   한 건도 읽지 못했다.** 따라서 제목이 아닌 본문 기반 판독과 스레드 단위 참여도 가중
   분석을 **수행하지 못했다.** 4절 수치는 ApeWisdom API 원수치(건수·추천수)와 제3자 톤
   집계값이며, 후자는 방법론 검증이 불가능하다.
2. **ApeWisdom 조회 창이 주말이다.** 2026-08-02(일) 조회, trailing 24h가 8/1(토)~8/2(일).
   34건이라는 표본과 -75% 감소는 **거래일 활동을 대표하지 않는다.** 거래일 기준 재조회가
   필요하다.
3. **Reddit 톤 집계 내부 모순.** adanos.org에서 r/wallstreetbets 5,239건이 Reddit 총계
   2,243건을 초과. **서브레딧별 분해 사용 불가** — 어느 커뮤니티에서 어떤 톤이 나왔는지
   판정 불가.
4. **Reddit 톤 집계 시점 불일치.** 창이 7/27에 닫혀 7/30~31 반등 미반영. 약세 편향.
5. **Q2 2026 13F 미공개.** 최신 기관 집계는 2026-03-31 기준. **7월 급락 국면의 기관
   포지셔닝 변화 판정 불가.** ARK 외 개별 기관 동향 미확보.
6. **7/20~7/31 Form 4 미확인.** 급락 중 내부자 대응 불명.
7. **등급 텍스트 결측.** Wells Fargo·Bernstein·BofA의 rating 문자열이 출처에 없어 목표가만
   기재. DZ Bank·Truist는 목표가도 비공개. Deutsche Bank PT $220 건은 날짜 미확인으로 제외.
8. **컨센서스 수치 불일치.** 애널리스트 수 53/61/67, 평균 $302.83/$304.26/$316.79로 출처별
   상이. 정밀 수치로 취급 불가.
9. **웹 출처 가격 불일치 4건** (1절 표 참조). verified 값만 채택했다.
10. **OpenAI 백스톱은 보도 단계다.** Nvidia 공식 확인이나 확정 조건 미확인. 이 리포트의
    최대 사건이 미확정 정보라는 점은 전체 판정의 신뢰도를 낮추는 요인이다.
