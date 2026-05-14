# YCT Exam Portal

Smart Examination Timetable Generator & Hall Navigation System for **Yaba College of Technology (Yabatech)**, School of Technology — Computer Science Department pilot.

Live: [smart-exam-timetable.vercel.app](https://smart-exam-timetable.vercel.app)

---

## Features

**Admin Portal**
- Manage schools, departments, programmes, levels, courses, and exam halls
- Bulk import courses via CSV upload
- Auto-generate conflict-free exam timetables using the **DSatur graph-colouring algorithm**
- Assign students to halls and seats automatically, spreading across multiple halls when needed
- Publish timetables, manually move entries, and reset drafts

**Student Portal**
- View personal exam timetable (dates, times, hall, seat number)
- Register for courses during onboarding
- **Live GPS navigation** to any exam hall — auto-detects device location, finds nearest campus node, and calculates the walking route via **Dijkstra shortest path**
- Interactive campus map powered by Leaflet + OpenStreetMap

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | Supabase (hosted PostgreSQL) |
| ORM | Prisma 7 |
| Auth | Supabase Auth + role metadata (`admin`, `superadmin`, `student`) |
| Styling | TailwindCSS v4 + shadcn/ui (base-maia preset) |
| Fonts | Figtree (body) · JetBrains Mono (headings) · Geist Mono (code) |
| Map | Leaflet.js + react-leaflet + OpenStreetMap tiles |
| State | TanStack React Query |
| Forms | React Hook Form + Zod |
| Hosting | Vercel |

---

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/m1r4g3-code/yct-exam-nav-system.git
cd yct-exam-nav-system/smart-exam-timetable
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
DATABASE_URL=your_supabase_transaction_pooler_url   # port 6543
DIRECT_URL=your_supabase_direct_url                 # port 5432
ADMIN_SETUP_SECRET=a_secure_random_secret
```

### 3. Database

```bash
npm run db:generate    # generate Prisma client
npm run db:migrate     # apply migrations
npm run db:seed        # seed demo data (schools, courses, students, nav nodes)
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Default superadmin after seed: `admin@yabatech-examportal.com` / `Admin@2025`

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio |

---

## Project Structure

```
app/
  (auth)/         Login, register, course selection
  (admin)/        Admin portal — CRUD, timetable generation
  (student)/      Student portal — dashboard, navigation, profile
  api/            Next.js API routes (REST)
components/
  ui/             shadcn/ui components
  map/            Leaflet map (dynamic import, SSR disabled)
lib/
  services/       DSatur, Dijkstra, hall assigner, graph builder
  supabase/       Browser, server, and admin Supabase clients
prisma/
  schema.prisma   Full DB schema (15 models)
  seed.ts         Demo data
```

---

## Algorithms

**DSatur (timetable generation)**  
Colours an exam conflict graph — courses sharing enrolled students get different time slots. Tie-breaks by saturation → degree → course ID for deterministic output.

**Dijkstra (hall navigation)**  
In-memory bidirectional campus graph built from `navigation_nodes` + `navigation_paths`. Cached at module level. The student's live GPS position is snapped to the nearest node to pick the route start automatically.

---

## Deployment

Deployed on Vercel. Each push to `main` triggers an automatic redeploy.

To deploy your own instance:

```bash
npm i -g vercel
vercel link
vercel env add   # add all six env vars
vercel --prod
```
