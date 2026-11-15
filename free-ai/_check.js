
const DATA = [
  /* ---------- 이미 보유한 키 ---------- */
  {
    name:"OpenRouter", tier:"free", own:true, tags:["추론","코딩"],
    cat:"멀티 프로바이더 게이트웨이 · 467개 모델",
    limits:"<code>:free</code> 모델 <b>20 RPM</b> 고정. 일일 한도는 누적 결제액 <b>$10 미만 → 50 RPD</b>, 이상 → 1,000 RPD (공식 limits 문서 표)",
    models:[{id:"google/gemma-4-31b-it:free",note:"262K"}, {id:"nvidia/nemotron-3-ultra-550b-a55b:free",note:"1M"}, {id:"baidu/ernie-5.5-flash-preview:free",note:"1M"}],
    extra:"현재 무료 <code>:free</code> 모델 17종 (모델 API 실측)",
    base:"https://openrouter.ai/api/v1",
    curl:'curl https://openrouter.ai/api/v1/chat/completions \\\n  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"google/gemma-4-31b-it:free","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"무료 모델은 인기 시간대에 429가 잦습니다. 결제를 $10 이상 한 번 하면 RPD가 1,000으로 올라갑니다.",
    src:{label:"openrouter.ai/docs/api-reference/limits", url:"https://openrouter.ai/docs/api-reference/limits"}
  },
  {
    name:"Groq", tier:"free", own:true, tags:["초고속","추론"],
    cat:"LPU 추론 · OpenAI 호환",
    limits:"<code>openai/gpt-oss-120b</code> <b>30 RPM · 1,000 RPD · 8K TPM · 200K TPD</b> (문서 표는 Developer 플랜 기준이라고 명시 — 무료 계정은 콘솔 Limits에서 확인)",
    models:[{id:"openai/gpt-oss-120b",note:"120B"}, {id:"qwen/qwen3.8-27b",note:"27B"}, {id:"whisper-large-v3-turbo",note:"STT"}],
    extra:"<code>llama-3.3-70b-versatile</code>은 무료 목록에서 은퇴(목록에 없음)",
    base:"https://api.groq.com/openai/v1",
    curl:'curl https://api.groq.com/openai/v1/chat/completions \\\n  -H "Authorization: Bearer $GROQ_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"openai/gpt-oss-120b","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"TPM 8K가 실제 병목입니다. 긴 프롬프트·에이전트 루프는 금방 429가 납니다.",
    src:{label:"console.groq.com/docs/rate-limits", url:"https://console.groq.com/docs/rate-limits"}
  },
  {
    name:"Google AI Studio (Gemini)", tier:"free", own:true, tags:["비전","추론"],
    cat:"무료 등급 = Flash·Flash-Lite 계열",
    limits:"무료 등급 <b>제공</b>(가격표에 Free of charge): 3.8 Flash · 3.6 Flash · 3.5/3.1 Flash-Lite · 2.5 Flash · 4 Hydrogen. <span class='unknown'>모델별 RPM/RPD/TPM은 AI Studio 로그인 화면에만 표시 → 확인 못 함</span>",
    models:[{id:"gemini-3.8-flash",note:"무료"}, {id:"gemini-3.6-flash",note:"무료"}, {id:"gemini-3.5-flash-lite",note:"무료"}],
    extra:"무료 불가: <code>gemini-4-carbon</code>, <code>gemini-4-argon</code>, <code>gemini-3.1-pro-preview</code>, omni-flash",
    base:"https://generativelanguage.googleapis.com/v1beta/openai/",
    curl:'curl https://generativelanguage.googleapis.com/v1beta/openai/chat/completions \\\n  -H "Authorization: Bearer $GEMINI_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"gemini-3.8-flash","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"RPD는 태평양 자정에 리셋. 무료 등급은 입력이 모델 개선에 쓰일 수 있습니다(유료는 아님).",
    src:{label:"ai.google.dev/gemini-api/docs/pricing", url:"https://ai.google.dev/gemini-api/docs/pricing"}
  },
  {
    name:"Cloudflare Workers AI", tier:"free", own:true, tags:["코딩"],
    cat:"엣지 추론 · 뉴런 단위 과금",
    limits:"<b>1일 10,000 뉴런 무료</b> (매일 00:00 UTC 리셋). 초과분은 Workers Paid($0.011/1,000 뉴런)",
    models:[{id:"@cf/openai/gpt-oss-120b",note:"일반"}, {id:"@cf/qwen/qwen3.8-27b",note:"27B"}, {id:"@cf/meta/llama-3.3-70b-instruct-fp8-fast",note:"70B"}],
    extra:"kimi-k2.6 · glm-5.2/5.3 · deepseek-v4 계열은 유료 결제수단 필요",
    base:"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/",
    curl:'curl https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/run/@cf/openai/gpt-oss-120b \\\n  -H "Authorization: Bearer $CF_API_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"뉴런은 모델마다 소모량이 달라서 10,000이 체감상 하루 20~60회 수준까지 줄어듭니다.",
    src:{label:"developers.cloudflare.com/workers-ai/platform/pricing", url:"https://developers.cloudflare.com/workers-ai/platform/pricing/"}
  },
  {
    name:"NVIDIA NIM (build.nvidia.com)", tier:"free", own:true, tags:["추론","비전"],
    cat:"프로토타이핑용 무료 엔드포인트",
    limits:"모델 대부분 <b>최대 40 RPM</b>, 모델 페이지 표기 <b>1일 10,000 요청</b>. 크레딧 차감 방식 여부는 <span class='unknown'>확인 못 함</span>(공식 FAQ는 'rate limit 기반' 서술)",
    models:[{id:"nvidia/nemotron-3.5-lightning-30b-a3b",note:"경량"}, {id:"deepseek-ai/deepseek-v4.1-flash",note:"1M"}, {id:"nvidia/nemotron-3-ultra-550b-a55b",note:"550B"}],
    extra:"OpenAI 호환 · NVIDIA 개발자 계정만 있으면 카드 불필요",
    base:"https://integrate.api.nvidia.com/v1",
    curl:'curl https://integrate.api.nvidia.com/v1/chat/completions \\\n  -H "Authorization: Bearer $NVIDIA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"nvidia/nemotron-3.5-lightning-30b-a3b","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"약관상 '체험 목적'입니다. 개인정보·프로덕션 트래픽을 넣지 말 것.",
    src:{label:"build.nvidia.com", url:"https://build.nvidia.com"}
  },

  /* ---------- 키·가입 없이 ---------- */
  {
    name:"Kilo AI Gateway", tier:"nokey", own:false, tags:["코딩"],
    cat:"OpenRouter 호환 게이트웨이 · 키 없이 호출",
    limits:"키 없이 호출 <b>실측 성공(HTTP 200)</b>. 정확한 레이트리밋은 <span class='unknown'>확인 못 함</span>(과거 프로브: IP당 시간당 200회)",
    models:[{id:"liquid/lfm-3-1.7b:free",note:"검증"}, {id:"nvidia/nemotron-3-ultra-550b-a55b:free",note:"1M"}, {id:"kilo-auto/free",note:"자동 라우팅"}],
    extra:"무료 모델 17종 — OpenRouter와 같은 카탈로그",
    base:"https://ai-gateway.kilo.ai/api/v1",
    curl:'curl https://ai-gateway.kilo.ai/api/v1/chat/completions -H "Content-Type: application/json" \\\n  -d \'{"model":"liquid/lfm-3-1.7b:free","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"키 없이 쓰는 만큼 언제든 막힐 수 있습니다. 중요한 작업의 단일 의존처로 두지 마세요.",
    src:{label:"ai-gateway.kilo.ai/api/v1/models", url:"https://ai-gateway.kilo.ai/api/v1/models"}
  },
  {
    name:"OVHcloud AI Endpoints", tier:"nokey", own:false, tags:["추론","오디오"],
    cat:"익명 호출 가능한 유럽 리전 엔드포인트",
    limits:"키 없이 chat/completions <b>실측 성공(HTTP 200)</b>. 익명 레이트리밋은 <span class='unknown'>확인 못 함</span>(과거 프로브: 익명 2 RPM)",
    models:[{id:"Meta-Llama-3_3-70B-Instruct",note:"검증"}, {id:"whisper-large-v3-turbo",note:"STT"}],
    extra:"모델 카탈로그 전부 'Try for free' 표기",
    base:"https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    curl:'curl https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions -H "Content-Type: application/json" \\\n  -d \'{"model":"Meta-Llama-3_3-70B-Instruct","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"2 RPM 수준이면 대화 한 번에 끝납니다. 무료 키를 발급하면 한도가 올라갑니다.",
    src:{label:"endpoints.ai.cloud.ovh.net", url:"https://endpoints.ai.cloud.ovh.net/"}
  },
  {
    name:"Pollinations.ai", tier:"nokey", own:false, tags:["비전"],
    cat:"텍스트·이미지 생성 · 키 없이 호출",
    limits:"키 없이 GET/POST 모두 <b>실측 성공(HTTP 200)</b>. 정확한 한도는 <span class='unknown'>확인 못 함</span>",
    models:[{id:"openai",note:"텍스트"}],
    extra:"이미지 생성은 URL 파라미터 방식으로 동작",
    base:"https://text.pollinations.ai/openai",
    curl:'curl https://text.pollinations.ai/openai -H "Content-Type: application/json" \\\n  -d \'{"model":"openai","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"익명 호출은 속도·품질이 들쭉날쭉합니다. 반복 사용은 무료 키 발급이 안정적.",
    src:{label:"pollinations.ai", url:"https://pollinations.ai/"}
  },

  /* ---------- 카드 없이 가입 후 무료 ---------- */
  {
    name:"Z.ai (GLM)", tier:"free", own:false, tags:["추론","코딩"],
    cat:"Zhipu GLM · Flash 계열 $0",
    limits:"<b>GLM-4.7-Flash · GLM-4.5-Flash · GLM-4.6V-Flash = 전 구간 Free</b>(공식 가격표). RPM/RPD는 <span class='unknown'>확인 못 함</span>",
    models:[{id:"glm-4.7-flash",note:"무료"}, {id:"glm-4.5-flash",note:"무료"}, {id:"glm-4.6v-flash",note:"비전"}],
    extra:"GLM-5.3 등 상위 모델은 유료($1.4/$4.4 per 1M)",
    base:"https://api.z.ai/api/paas/v4",
    curl:'curl https://api.z.ai/api/paas/v4/chat/completions \\\n  -H "Authorization: Bearer $ZAI_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"glm-4.7-flash","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"모델 ID 대소문자는 콘솔 표기와 다를 수 있으니 /models로 확인.",
    src:{label:"docs.z.ai/guides/overview/pricing", url:"https://docs.z.ai/guides/overview/pricing"}
  },
  {
    name:"Cohere Trial", tier:"free", own:false, tags:["추론"],
    cat:"RAG·rerank 강점 · Trial 키",
    limits:"Trial 키 <b>월 1,000 API 호출</b>, 채팅 모델 <b>20 req/min</b>. Rerank 10 req/min, Embed 2,000 inputs/min",
    models:[{id:"command-a-plus-05-2026",note:"채팅"}, {id:"north-mini-code-1.0",note:"코딩"}],
    extra:"Trial 키 = 무료(상업적 사용 불가) · Production 키는 유료",
    base:"https://api.cohere.com/v2",
    curl:'curl https://api.cohere.com/v2/chat \\\n  -H "Authorization: Bearer $COHERE_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"command-a-03-2025","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"월 1,000회는 리랭크 파이프라인에서 금방 소진됩니다. Trial 키는 상업적 사용 금지.",
    src:{label:"docs.cohere.com/docs/rate-limits", url:"https://docs.cohere.com/docs/rate-limits"}
  },
  {
    name:"Routeway", tier:"free", own:false, tags:["추론","코딩"],
    cat:"OpenRouter 유사 · :free 모델",
    limits:":free 모델 <b>9종</b>(모델 API 실측). 레이트리밋 <span class='unknown'>확인 못 함</span>(과거: 5 RPM·일 200회)",
    models:[{id:"deepseek-v4.1-flash:free",note:"1M"}, {id:"gemma-4-26b-a4b-it-meromero:free",note:"26B"}, {id:"minimax-m3.1-flash:free",note:"경량"}],
    extra:"키 없이 호출은 Cloudflare가 차단(403) → <b>무료 키 필요</b>",
    base:"https://api.routeway.ai/v1",
    curl:'curl https://api.routeway.ai/v1/chat/completions \\\n  -H "Authorization: Bearer $ROUTEWAY_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"deepseek-v4.1-flash:free","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"모델 이름에 프로바이더 별칭이 붙어 있어(meromero 등) 같은 모델의 변형이 많습니다.",
    src:{label:"api.routeway.ai/v1/models", url:"https://api.routeway.ai/v1/models"}
  },
  {
    name:"Novita AI", tier:"free", own:false, tags:["추론","비전"],
    cat:"TIME LIMITED FREE 모델 운영",
    limits:"무료 표기 모델 존재(Ling 3.0 Flash 계열 등). 그 외는 토큰 과금. 레이트리밋 <span class='unknown'>확인 못 함</span>",
    models:[{id:"Ling 3.0 Flash",note:"기간 한정"}, {id:"Ling 3.0 Flash VL",note:"비전"}],
    extra:"'TIME LIMITED FREE'는 말 그대로 기간 한정 — 만료되면 과금으로 전환",
    base:"https://api.novita.ai/v3/openai",
    curl:'curl https://api.novita.ai/v3/openai/chat/completions \\\n  -H "Authorization: Bearer $NOVITA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"<model-id>","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"무료 모델 ID는 /v3/openai/models에서 pricing 0인 것을 골라 쓰세요.",
    src:{label:"novita.ai/pricing", url:"https://novita.ai/pricing"}
  },
  {
    name:"Kiro (AWS)", tier:"free", own:false, tags:["코딩"],
    cat:"에이전트 IDE/CLI · Claude Sonnet 4.5",
    limits:"<b>Free $0 · 월 50 크레딧</b>, 오픈웨이트 모델 + Claude Sonnet 4.5 사용 가능",
    models:[{id:"Claude Sonnet 4.5",note:"모델 선택"}, {id:"Auto",note:"자동 라우팅"}],
    extra:"<b>IDE/CLI 전용</b> — Kiro Web은 Pro 이상. API 키로 쓰는 서비스가 아닙니다",
    base:"kiro.dev (IDE/CLI 클라이언트)",
    curl:"# API가 아니라 IDE/CLI 도구입니다\n# kiro.dev/downloads 에서 설치 후 AWS Builder ID 또는 소셜 로그인",
    caveat:"월 50크레딧은 세션 몇 번이면 소진. Sonnet 4.6은 Auto 대비 1.3배 차감.",
    src:{label:"kiro.dev/pricing", url:"https://kiro.dev/pricing/"}
  },

  /* ---------- 체험 크레딧 ---------- */
  {
    name:"Fireworks AI", tier:"trial", own:false, tags:["추론"],
    cat:"서버리스 추론 · 선불 크레딧",
    limits:"$1 가입 크레딧 지급 여부 <span class='unknown'>확인 못 함</span> — 현재 가격표는 '선불 크레딧 차감' 구조만 명시",
    models:[{id:"deepseek-v4.1-flash",note:"$0.30/1M"}, {id:"glm-5.3-flash",note:"$0.15/1M"}],
    modelNote:"모델 경로는 accounts/fireworks/models/<id> 형식",
    extra:"모델 단가는 저렴하지만 크레딧이 없으면 호출 불가",
    base:"https://api.fireworks.ai/inference/v1",
    curl:'curl https://api.fireworks.ai/inference/v1/chat/completions \\\n  -H "Authorization: Bearer $FIREWORKS_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"accounts/fireworks/models/<model-id>","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"무료 목적으로 쓰려면 가입 직후 계정에 크레딧이 찍혔는지 Billing에서 먼저 확인하세요.",
    src:{label:"fireworks.ai/pricing", url:"https://fireworks.ai/pricing"}
  },
  {
    name:"Upstage", tier:"trial", own:false, tags:["추론"],
    cat:"Solar · 한국어 강점",
    limits:"$10 가입 크레딧 <span class='unknown'>확인 못 함</span> — 현재 콘솔은 '결제수단 등록 후 사용' 또는 선불 크레딧 구매 안내",
    models:[{id:"solar-pro",note:"채팅"}],
    extra:"크레딧 구매 시 레이트리밋도 함께 상승한다고 안내",
    base:"https://api.upstage.ai/v1",
    curl:'curl https://api.upstage.ai/v1/chat/completions \\\n  -H "Authorization: Bearer $UPSTAGE_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"solar-pro","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"가입만으로 바로 호출되는 구조가 아니므로 '카드 없는 무료'로 분류하면 안 됩니다.",
    src:{label:"console.upstage.ai/docs", url:"https://console.upstage.ai/docs/getting-started/quick-start"}
  },
  {
    name:"Baseten", tier:"trial", own:false, tags:["추론"],
    cat:"모델 호스팅 · 신규 크레딧",
    limits:"신규 가입 크레딧 금액 <span class='unknown'>확인 못 함</span>(공개 가격표에 없음)",
    models:[{id:"GLM-5.3-Flash",note:"$0.15/1M"}, {id:"DeepSeek V4.1 Flash",note:"$0.30/1M"}],
    extra:"무료 크레딧은 계정 생성 후 Billing에서만 확인 가능",
    base:"https://inference.baseten.co/v1",
    curl:'curl https://inference.baseten.co/v1/chat/completions \\\n  -H "Authorization: Bearer $BASETEN_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"<model-id>","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"금액이 공개되지 않아 '얼마나 쓸 수 있는지'를 미리 알 수 없습니다.",
    src:{label:"baseten.co/pricing", url:"https://www.baseten.co/pricing/"}
  },

  /* ---------- 주의보 ---------- */
  {
    name:"Mistral", tier:"warn", own:true, tags:["코딩"],
    cat:"기존 보유 키 · 신규 API는 결제 필요",
    limits:"공식 Quickstart 전제조건: <b>API 액세스가 있는 플랜 + 결제수단</b>. Free 플랜은 Vibe·Studio 화면용",
    models:[{id:"mistral-small-latest",note:"문서 예제"}],
    extra:"기존에 발급한 키는 <code>GET /v1/models</code>로 살아있는지 먼저 확인",
    base:"https://api.mistral.ai/v1",
    curl:'curl https://api.mistral.ai/v1/models -H "Authorization: Bearer $MISTRAL_API_KEY"',
    caveat:"2026-11-05경 Free 모드에서 API가 빠졌다는 3자 추적이 있습니다. 키가 401/402로 막히면 이 변화입니다.",
    src:{label:"docs.mistral.ai · create your first API key", url:"https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key"}
  },
  {
    name:"Inception (Mercury)", tier:"warn", own:false, tags:["초고속"],
    cat:"유료 전환 + API 종료 예정",
    limits:"Mercury 3 = <b>$0.10/$0.35 per 1M</b>(정가의 50% 런치 할인). 무료 1억 토큰 이벤트 종료",
    models:[{id:"mercury-3",note:"1M ctx"}],
    extra:"<b>Mercury API는 2026-12-28까지만 운영</b>(공식 문서 배너)",
    base:"https://api.inceptionlabs.ai/v1",
    curl:'curl https://api.inceptionlabs.ai/v1/chat/completions \\\n  -H "Authorization: Bearer $INCEPTION_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"mercury-3","messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"지금 새로 붙일 이유가 없습니다. 쓸 데이터가 있으면 12/28 전에 내보내세요.",
    src:{label:"docs.inceptionlabs.ai/get-started/models", url:"https://docs.inceptionlabs.ai/get-started/models"}
  },
  {
    name:"Cerebras", tier:"warn", own:false, tags:["초고속"],
    cat:"$5 체험 = 카드 필수",
    limits:"$5 프로모 크레딧은 <b>유효한 결제수단 등록</b>이 조건, <b>30일 후 만료</b>",
    models:[{id:"(모델 목록 변동)",note:""}],
    extra:"카드 없이는 무료 사용 불가",
    base:"https://api.cerebras.ai/v1",
    curl:'# 결제수단 등록 없이는 호출 불가',
    caveat:"'무료 $5' 문구만 보고 가입하면 카드 등록 화면에서 멈춥니다.",
    src:{label:"cerebras.ai/pricing", url:"https://www.cerebras.ai/pricing"}
  },
  {
    name:"GitHub Models", tier:"warn", own:false, tags:["추론"],
    cat:"완전 종료",
    limits:"<b>2026-07-30 전면 종료</b> — 플레이그라운드·카탈로그·추론 API 모두",
    models:[{id:"(없음)",note:"서비스 종료"}],
    extra:"문서 페이지에도 'has been retired'로 남아 있음",
    base:"(종료)",
    curl:"# 2026-07-30 서비스 종료",
    caveat:"예전 글·영상이 계속 '무료'로 소개합니다. 지금은 동작하지 않습니다.",
    src:{label:"docs.github.com/github-models", url:"https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models"}
  },
  {
    name:"Hugging Face Inference", tier:"warn", own:false, tags:["추론"],
    cat:"무료 계정 월 크레딧 0",
    limits:"Free 계정 월 크레딧 <b>0</b> — Inference Providers는 <b>크레딧 구매 또는 PRO($2/월 크레딧)</b> 필요",
    models:[{id:"(제공사 라우팅)",note:"PRO $2"}],
    extra:"Spaces·Jobs도 같은 크레딧 풀을 공유",
    base:"https://router.huggingface.co/v1",
    curl:'# 무료 계정은 크레딧 구매 없이 호출 불가',
    caveat:"'HF는 무료'라는 인식은 Inference API 시절 이야기입니다.",
    src:{label:"huggingface.co/docs/inference-providers/pricing", url:"https://huggingface.co/docs/inference-providers/pricing"}
  },
  {
    name:"SambaNova Cloud", tier:"warn", own:false, tags:["추론"],
    cat:"결제수단·크레딧 구매 필요",
    limits:"결제수단 추가 및 크레딧 구매 필수로 전환 (2026-11-14 실측) · 오늘 재확인 <span class='unknown'>확인 못 함</span>",
    models:[{id:"(모델 목록 변동)",note:""}],
    extra:"과거 '무료 티어' 안내 글과 다름",
    base:"https://api.sambanova.ai/v1",
    curl:'# 결제수단 없이 호출 불가(11-14 확인)',
    caveat:"무료로 소개하는 글 다수가 2025년 기준입니다.",
    src:{label:"cloud.sambanova.ai/plans", url:"https://cloud.sambanova.ai/plans"}
  },
  {
    name:"Nebius / DeepInfra / Scaleway", tier:"warn", own:false, tags:["추론"],
    cat:"카드·선결제 필요",
    limits:"카드 또는 선결제 필요 (2026-11-14 실측) · 오늘 개별 재확인 <span class='unknown'>확인 못 함</span>",
    models:[{id:"(각 사 모델)",note:""}],
    extra:"Nebius는 프로모 코드로만 크레딧 지급",
    base:"각 사 v1 엔드포인트",
    curl:'# 카드 등록 없이는 무료 사용 불가',
    caveat:"가입 화면에서 카드 요구가 나오면 '무료'가 아닙니다.",
    src:{label:"nebius.com/prices", url:"https://nebius.com/prices"}
  },
  {
    name:"Anthropic (Claude API)", tier:"warn", own:false, tags:["코딩"],
    cat:"결제 필수 · 무료 크레딧 문구 상충",
    limits:"가격표 FAQ에는 '신규 사용자 무료 크레딧 제공' 문구가 있으나, 가입 시 카드 요구 여부는 <span class='unknown'>확인 못 함</span>(2026-11-11 실측에서는 무료 크레딧 없이 결제 필수)",
    models:[{id:"claude-sonnet-5-5",note:"유료"}],
    extra:"결제는 카드 또는 인보이스",
    base:"https://api.anthropic.com/v1",
    curl:'curl https://api.anthropic.com/v1/messages \\\n  -H "x-api-key: $ANTHROPIC_API_KEY" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"claude-sonnet-5-5","max_tokens":32,"messages":[{"role":"user","content":"hi"}]}\'',
    caveat:"문서 문구와 실제 가입 흐름이 다를 수 있어 '무료'로 기대하고 가입하면 안 됩니다.",
    src:{label:"docs.claude.com/en/docs/about-claude/pricing", url:"https://docs.claude.com/en/docs/about-claude/pricing"}
  },
  {
    name:"SiliconFlow", tier:"warn", own:false, tags:["추론"],
    cat:"신원 인증 필요",
    limits:"일부 $0 모델과 $1 크레딧이 있으나 <b>신원 인증</b>이 필요 (2026-11-14 기록) · 오늘 재확인 <span class='unknown'>확인 못 함</span>",
    models:[{id:"(모델 목록 변동)",note:""}],
    extra:"해외 사용자는 여권/신분증 인증 단계가 있습니다",
    base:"https://api.siliconflow.com/v1",
    curl:'# 신원 인증 완료 후 사용 가능',
    caveat:"'가입만 하면 무료'가 아니라 인증이 병목입니다.",
    src:{label:"docs.siliconflow.com", url:"https://docs.siliconflow.com/en/userguide/quickstart"}
  }
];

const TIER_LABEL = {nokey:"카드X · 키X", free:"카드X · 영구무료", trial:"체험 크레딧", warn:"주의보"};

const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const countEl = document.getElementById("count");
const qEl = document.getElementById("q");
let activeTier = "all";
let activeTags = new Set();

function esc(s){return String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

function haystack(d){
  return [d.name, d.cat, d.limits, d.extra||"", d.caveat, (d.tags||[]).join(" "),
    (d.models||[]).map(m=>m.id).join(" "), d.base].join(" ").toLowerCase().replace(/<[^>]+>/g," ");
}

function cardHTML(d, i){
  const own = d.own ? '<span class="bdg own">보유</span>' : '';
  const tb = `<span class="bdg ${d.tier}">${TIER_LABEL[d.tier]}</span>`;
  const models = (d.models||[]).map(m=>`
      <div class="code-row">
        <code>${esc(m.id)}</code>
        <button class="cp" data-copy="${esc(m.id)}" aria-label="${esc(m.id)} 복사">복사</button>
      </div>`).join("");
  const tags = (d.tags||[]).map(t=>`<span class="tg">${esc(t)}</span>`).join("");
  return `
  <article class="card" data-tier="${d.tier}" data-idx="${i}">
    <div class="card-top">
      <div>
        <div class="nm">${esc(d.name)}</div>
        <div class="cat">${esc(d.cat)}</div>
      </div>
      <div class="badges">${own}${tb}</div>
    </div>

    <dl class="kv">
      <dt>한도</dt><dd>${d.limits}</dd>
      <dt>모델 ID</dt><dd>${models}</dd>
      ${d.extra ? `<dt>메모</dt><dd>${d.extra}</dd>` : ""}
    </dl>

    <div>
      <p class="lbl">Base URL</p>
      <div class="code-row">
        <code>${esc(d.base)}</code>
        <button class="cp" data-copy="${esc(d.base)}" aria-label="Base URL 복사">복사</button>
      </div>
    </div>

    <div>
      <p class="lbl">호출 예시</p>
      <div class="code-row">
        <code title="${esc(d.curl)}">${esc(d.curl.split("\n")[0])}</code>
        <button class="cp" data-copy="${esc(d.curl)}" aria-label="curl 예시 복사">전체</button>
      </div>
    </div>

    <div class="caveat">${d.caveat}</div>

    <div class="src">
      <div class="tags">${tags}</div>
      <a href="${esc(d.src.url)}" target="_blank" rel="noopener noreferrer">출처 ↗</a>
    </div>
  </article>`;
}

function render(){
  const q = qEl.value.trim().toLowerCase();
  const list = DATA.map((d,i)=>({d,i})).filter(({d})=>{
    if (activeTier === "own" && !d.own) return false;
    if (activeTier !== "all" && activeTier !== "own" && d.tier !== activeTier) return false;
    if (activeTags.size && ![...activeTags].every(t=>(d.tags||[]).includes(t))) return false;
    if (q && !haystack(d).includes(q)) return false;
    return true;
  });
  grid.innerHTML = list.map(({d,i})=>cardHTML(d,i)).join("");
  empty.hidden = list.length > 0;
  countEl.innerHTML = `<b>${list.length}</b> / ${DATA.length}개 항목 표시 중`;
}

function stats(){
  const n = t => DATA.filter(d=>d.tier===t).length;
  document.getElementById("s-nokey").textContent = n("nokey");
  document.getElementById("s-free").textContent = n("free") + n("trial");
  document.getElementById("s-own").textContent = DATA.filter(d=>d.own).length;
  document.getElementById("s-total").textContent = DATA.length;
  document.querySelectorAll(".tab").forEach(t=>{
    const k = t.dataset.tier;
    const num = k==="all" ? DATA.length : k==="own" ? DATA.filter(d=>d.own).length : DATA.filter(d=>d.tier===k).length;
    t.querySelector(".n").textContent = num;
  });
}

document.getElementById("tabs").addEventListener("click", e=>{
  const b = e.target.closest(".tab"); if(!b) return;
  activeTier = b.dataset.tier;
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-pressed", String(t===b)));
  render();
});
document.getElementById("chips").addEventListener("click", e=>{
  const b = e.target.closest(".chip"); if(!b) return;
  const tag = b.dataset.tag;
  if (activeTags.has(tag)) activeTags.delete(tag); else activeTags.add(tag);
  b.setAttribute("aria-pressed", String(activeTags.has(tag)));
  render();
});
qEl.addEventListener("input", render);

let toastTimer;
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg || "복사됨";
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove("on"), 1400);
}
async function copyText(text, btn){
  try{
    if (navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position="fixed"; ta.style.opacity="0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    if (btn){ const o = btn.textContent; btn.textContent = "✓"; btn.classList.add("done");
      setTimeout(()=>{btn.textContent = o; btn.classList.remove("done");}, 1200); }
    toast("복사됨");
  }catch(err){ toast("복사 실패 — 길게 눌러 선택하세요"); }
}
grid.addEventListener("click", e=>{
  const b = e.target.closest(".cp"); if(!b) return;
  copyText(b.dataset.copy, b);
});

stats();
render();
