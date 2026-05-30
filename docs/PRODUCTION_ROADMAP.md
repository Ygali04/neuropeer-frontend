# NeuroPeer Production Roadmap

Everything needed to go from localhost to a shareable production link.

---

## 1. Authentication & User Accounts (~2 days)

**Recommended: NextAuth.js v5** (best Next.js integration, supports OAuth 2.0 + email).

### Frontend (Next.js)

```bash
npm install next-auth@beta
```

Providers: Google OAuth, GitHub OAuth, Email (magic link via Resend/SendGrid).

Create `frontend/app/api/auth/[...nextauth]/route.ts`:
```typescript
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import GitHub from "next-auth/providers/github"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, GitHub],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
  },
})
```

### Backend (FastAPI)

Middleware validates the JWT from NextAuth on every request:

```python
from fastapi import Depends, HTTPException
from jose import jwt, JWTError

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, NEXTAUTH_SECRET, algorithms=["HS256"])
        return payload["sub"]  # user ID
    except JWTError:
        raise HTTPException(status_code=401)
```

### Database Schema

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    provider TEXT NOT NULL DEFAULT 'email',
    hashed_password TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- Link jobs to users
ALTER TABLE jobs ADD COLUMN user_id UUID REFERENCES users(id);
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
```

Data ownership: filter all queries by `user_id = current_user.id`.

---

## 2. Per-User Data Storage (~1 day)

### S3 Bucket Structure

```
neuropeer-media/
  users/{user_id}/
    jobs/{job_id}/
      video.mp4
      audio.wav
      transcript.json
      events.parquet
      vertices.npz        # (n_timesteps, 20484) predictions
      timeseries.npz       # attention/arousal/cog curves
      metrics.json
      neural_score.json
      key_moments.json
      modality_breakdown.json
      pipeline.log
      REPORT.pdf
```

### Lifecycle Policies

- Raw media (video.mp4, audio.wav): auto-delete after 30 days
- Analysis artifacts (metrics, scores, reports): keep indefinitely
- Predictions (vertices.npz): transition to S3 Glacier after 7 days

### Access Control

- All media URLs use presigned URLs (1h expiry)
- Frontend fetches presigned URL from API, never accesses S3 directly
- Backend generates presigned URL only for the authenticated user's data

---

## 3. Structured Logging (~1 day)

### Implementation

`structlog` is already in requirements. Configure it:

```python
import structlog

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
)
```

### Correlation IDs

Add middleware that generates a correlation ID per request, propagated to Celery tasks:

```python
@app.middleware("http")
async def add_correlation_id(request, call_next):
    correlation_id = request.headers.get("X-Correlation-ID", str(uuid4()))
    structlog.contextvars.bind_contextvars(correlation_id=correlation_id)
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = correlation_id
    return response
```

### Per-Job Log Files

Save complete pipeline logs to S3 alongside results: `users/{user_id}/jobs/{job_id}/pipeline.log`

### Log Shipping

- **AWS**: CloudWatch Logs via `watchtower` library
- **Self-hosted**: Loki + Grafana (free, runs alongside existing Docker stack)

---

## 4. Domain, TLS & Deployment (~1-2 days)

### Frontend: Vercel

```bash
npm i -g vercel
vercel --prod
```

- Custom domain: `neuropeer.app` (A record → Vercel)
- Auto TLS, edge CDN, preview deployments on every PR
- Env var: `NEXT_PUBLIC_API_URL=https://api.neuropeer.app`

### Backend: Railway.app

- Docker-based deployment from GitHub
- Custom domain: `api.neuropeer.app`
- Managed PostgreSQL and Redis add-ons
- Auto-scaling: 1-4 API replicas
- Worker: separate service, 1 replica, 4GB+ memory

### DNS: Cloudflare

- Free tier: DDoS protection, analytics, SSL
- CNAME `neuropeer.app` → Vercel
- CNAME `api.neuropeer.app` → Railway

### Alternative: Fly.io

- Better for GPU-adjacent workloads
- Closer to metal (Docker-based, SSH access)
- Global edge deployment

---

## 5. CI/CD (~1 day)

### GitHub Actions

**`.github/workflows/lint.yml`** — runs on every PR:
```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/ruff-action@v3
```

**`.github/workflows/test.yml`** — runs on every PR:
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16-alpine, env: ... }
      redis: { image: redis:7-alpine }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
      - run: pip install -e ".[dev]"
      - run: pytest
```

**`.github/workflows/deploy-backend.yml`** — on push to main:
```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: railway up  # or fly deploy
```

### Branch Protection

- Require passing lint + test before merge
- Require 1 approval for PRs to main
- No force push to main

---

## 6. Rate Limiting (~0.5 days)

### FastAPI Middleware

Redis-backed sliding window rate limiter:

```python
from fastapi import Request
import redis.asyncio as aioredis

async def rate_limit(request: Request):
    key = f"rate:{request.client.host}"
    r = aioredis.from_url(REDIS_URL)
    count = await r.incr(key)
    if count == 1:
        await r.expire(key, 3600)  # 1h window
    if count > LIMIT:
        raise HTTPException(429, "Rate limit exceeded")
```

### Tier Limits

| Tier | Analyses/Hour | Analyses/Day | Video Length |
|------|--------------|-------------|--------------|
| Unauthenticated | 3 | 10 | 2 min max |
| Free | 5 | 15 | 5 min max |
| Pro | 50 | 200 | 10 min max |
| Enterprise | unlimited | unlimited | 30 min max |

### Additional Protections

- URL validation: restrict to known video platforms
- File size cap: 500MB max
- CAPTCHA on submission form (Cloudflare Turnstile — free)

---

## 7. Billing & Monetization (~2-3 days)

### Stripe Integration

```bash
pip install stripe
npm install @stripe/stripe-js @stripe/react-stripe-js
```

### Plans

| Plan | Price | Analyses/Month | Features |
|------|-------|---------------|----------|
| Free | $0 | 5 | Basic metrics, no PDF export |
| Pro | $49/mo | 100 | All 20 metrics, PDF/JSON export, A/B comparison |
| Enterprise | $299/mo | Unlimited | API access, team seats, priority GPU queue |

### Implementation

1. Create Stripe Products and Prices in the dashboard
2. Add checkout flow: `POST /api/billing/checkout` → Stripe Checkout Session
3. Handle webhooks: `POST /api/billing/webhook`
   - `checkout.session.completed` → activate subscription
   - `invoice.paid` → renew subscription
   - `customer.subscription.deleted` → downgrade to free
4. Usage metering: increment counter on `job.status = "complete"`, check before allowing new job

### Database

```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    stripe_subscription_id TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    analyses_used INT DEFAULT 0,
    analyses_limit INT DEFAULT 5,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. Monitoring & Observability (~1 day)

### Error Tracking: Sentry

```bash
pip install sentry-sdk[fastapi,celery]
npm install @sentry/nextjs
```

```python
import sentry_sdk
sentry_sdk.init(dsn="...", traces_sample_rate=0.1)
```

### Metrics: Prometheus + Grafana

Key metrics to track:
- Request latency (p50, p95, p99)
- Job queue depth and processing time
- GPU instance cost per job
- Success/failure rate
- Active users per day

### Health Checks

Existing: `GET /health` → `{"status": "ok"}`

Add:
- `GET /health/db` — PostgreSQL connectivity
- `GET /health/redis` — Redis connectivity
- `GET /health/s3` — S3/MinIO bucket access

### Alerting

- PagerDuty or Slack webhook
- Triggers: job failure rate > 10%, API latency > 5s, queue depth > 50

---

## 9. Security Checklist

- [ ] Secrets in environment variables only (never in code or git)
- [ ] CORS restricted to production domain (`neuropeer.app`)
- [ ] All SQL via SQLAlchemy ORM (parameterized queries)
- [ ] XSS prevention: Next.js built-in escaping + CSP headers
- [ ] CSRF: SameSite cookies + anti-CSRF tokens
- [ ] Rate limiting (Section 6)
- [ ] Input validation: URL allowlisting, file type/size checks
- [ ] Dependency scanning: Dependabot + `pip-audit` in CI
- [ ] HTTPS everywhere (Vercel + Railway handle TLS)
- [ ] Secure cookies: HttpOnly, Secure, SameSite=Strict
- [ ] API key rotation policy for DataCrunch and S3
- [ ] No secrets in Docker images or git history

---

## 10. Launch Checklist — "Share a Single Link"

1. [ ] Register domain `neuropeer.app`
2. [ ] Set up Cloudflare DNS
3. [ ] Deploy frontend to Vercel with custom domain
4. [ ] Deploy backend + worker to Railway with `api.neuropeer.app`
5. [ ] Provision managed PostgreSQL and Redis on Railway
6. [ ] Create production S3 bucket with CORS policy
7. [ ] Configure DataCrunch production credentials
8. [ ] Set up Sentry for error tracking (frontend + backend)
9. [ ] Implement NextAuth.js with Google OAuth
10. [ ] Create Stripe account and configure plans
11. [ ] Set up GitHub Actions CI/CD (lint → test → deploy)
12. [ ] Run full E2E test: signup → submit URL → view results → export PDF
13. [ ] Share the link

### Estimated Total Effort

| Section | Effort |
|---------|--------|
| Auth & Accounts | ~2 days |
| Per-User Storage | ~1 day |
| Structured Logging | ~1 day |
| Domain & Deployment | ~1-2 days |
| CI/CD | ~1 day |
| Rate Limiting | ~0.5 days |
| Billing | ~2-3 days |
| Monitoring | ~1 day |
| Security Hardening | ~1 day |
| **Total** | **~10-12 days** |
