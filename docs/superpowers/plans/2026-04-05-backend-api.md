# Noop Backend API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a NestJS + TypeORM + PostgreSQL/TimescaleDB backend API for the noop wearable app, supporting auth, data sync, and querying.

**Architecture:** NestJS REST API with JWT auth, TypeORM entities mapped to PostgreSQL tables (with TimescaleDB hypertables for time-series data). The iOS app pushes processed wellness data after each pipeline run and pulls on foreground. Idempotent upsert sync via (user_id, time) composite keys.

**Tech Stack:** NestJS 10, TypeORM, PostgreSQL 16 + TimescaleDB, passport-jwt, bcrypt, class-validator, Docker Compose, Cloud Run

---

## File Structure

```
backend/
  src/
    main.ts                           — Bootstrap, CORS, validation pipe
    app.module.ts                     — Root module imports
    config/
      database.config.ts              — TypeORM datasource config from env
    auth/
      auth.module.ts                  — Auth module
      auth.controller.ts              — POST /auth/register, /auth/login
      auth.service.ts                 — Hash, verify, sign JWT
      jwt.strategy.ts                 — Passport JWT strategy
      jwt-auth.guard.ts               — Guard for protected routes
      dto/
        register.dto.ts               — email, password validation
        login.dto.ts                  — email, password validation
    users/
      users.module.ts                 — Users module
      users.service.ts                — findByEmail, create
      user.entity.ts                  — User entity
    devices/
      devices.module.ts               — Devices module
      devices.controller.ts           — CRUD /devices
      devices.service.ts              — register, list, remove
      device.entity.ts                — Device entity
      dto/
        create-device.dto.ts          — device_name, strap_serial
    sync/
      sync.module.ts                  — Sync module
      sync.controller.ts              — POST /sync/push, GET /sync/pull
      sync.service.ts                 — Upsert batch, query since
      dto/
        push-sync.dto.ts             — Full sync payload DTO
    sleep/
      sleep.module.ts                 — Sleep module
      sleep.controller.ts            — GET /sleep/:date, /sleep/range
      sleep.service.ts               — Query sleep data by date/range
      entities/
        sleep-detection.entity.ts    — sleep_detections table
        sleep-stage.entity.ts        — sleep_stages table
        night-feature.entity.ts      — night_features table
    wellness/
      wellness.module.ts             — Wellness module
      wellness.controller.ts         — GET /wellness/:date
      wellness.service.ts            — Query scores/metrics
      entities/
        daily-score.entity.ts        — daily_scores table
        daily-metric.entity.ts       — daily_metrics table
        signal-sample.entity.ts      — signal_samples table
    journal/
      journal.module.ts              — Journal module
      journal.controller.ts          — CRUD /journal
      journal.service.ts             — Create, list, delete entries
      journal-entry.entity.ts        — journal_entries table
      dto/
        create-journal.dto.ts        — timestamp, factor_tag, intensity
    plans/
      plans.module.ts                — Sleep plan module
      plans.controller.ts            — GET/PUT /plans
      plans.service.ts               — Get/update sleep plan
      sleep-plan.entity.ts           — sleep_plans table
      baseline-profile.entity.ts     — baseline_profiles table
  migrations/
    001-init-schema.ts               — All tables + TimescaleDB hypertables
  docker-compose.yml                 — postgres:16-timescaledb + app
  Dockerfile                         — Multi-stage NestJS build
  .env.example                       — DB connection, JWT secret
  package.json
  tsconfig.json
  nest-cli.json
```

---

### Task 1: Scaffold NestJS Project + Docker Compose

**Files:**
- Create: `backend/` (entire scaffold)
- Create: `backend/docker-compose.yml`
- Create: `backend/Dockerfile`
- Create: `backend/.env.example`
- Create: `backend/.env`

- [ ] **Step 1: Scaffold NestJS project**

```bash
cd /Users/nishantgupta/Documents/noop
npx @nestjs/cli new backend --package-manager npm --skip-git
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/nishantgupta/Documents/noop/backend
npm install @nestjs/typeorm typeorm pg @nestjs/passport passport passport-jwt @nestjs/jwt bcrypt class-validator class-transformer
npm install -D @types/passport-jwt @types/bcrypt
```

- [ ] **Step 3: Create docker-compose.yml**

Write to `backend/docker-compose.yml`:

```yaml
version: '3.8'
services:
  db:
    image: timescale/timescaledb:latest-pg16
    restart: unless-stopped
    environment:
      POSTGRES_USER: noop
      POSTGRES_PASSWORD: noop_dev
      POSTGRES_DB: noop
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 4: Create .env.example and .env**

Write to `backend/.env.example`:

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=noop
DB_PASSWORD=noop_dev
DB_NAME=noop
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=7d
```

Copy to `backend/.env` with same values.

- [ ] **Step 5: Create database config**

Write to `backend/src/config/database.config.ts`:

```typescript
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function databaseConfig(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USER || 'noop',
    password: process.env.DB_PASSWORD || 'noop_dev',
    database: process.env.DB_NAME || 'noop',
    autoLoadEntities: true,
    synchronize: false,
  };
}
```

- [ ] **Step 6: Update app.module.ts**

Replace `backend/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(databaseConfig()),
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Update main.ts with validation pipe**

Replace `backend/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
```

- [ ] **Step 8: Install ConfigModule**

```bash
cd /Users/nishantgupta/Documents/noop/backend
npm install @nestjs/config
```

- [ ] **Step 9: Start DB and verify**

```bash
cd /Users/nishantgupta/Documents/noop/backend
docker compose up -d
npx ts-node -e "const { Client } = require('pg'); const c = new Client({host:'localhost',port:5432,user:'noop',password:'noop_dev',database:'noop'}); c.connect().then(() => c.query('SELECT 1')).then(r => { console.log('DB OK:', r.rows); c.end(); })"
```

Expected: `DB OK: [ { '?column?': 1 } ]`

- [ ] **Step 10: Verify NestJS starts**

```bash
cd /Users/nishantgupta/Documents/noop/backend
npm run start:dev
```

Expected: `Nest application successfully started` on port 3000.

- [ ] **Step 11: Commit**

```bash
cd /Users/nishantgupta/Documents/noop
git add backend/
git commit -m "feat(backend): scaffold NestJS + TypeORM + TimescaleDB docker-compose"
```

---

### Task 2: User Entity + Auth Module (register/login/JWT)

**Files:**
- Create: `backend/src/users/user.entity.ts`
- Create: `backend/src/users/users.module.ts`
- Create: `backend/src/users/users.service.ts`
- Create: `backend/src/auth/auth.module.ts`
- Create: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/auth.service.ts`
- Create: `backend/src/auth/jwt.strategy.ts`
- Create: `backend/src/auth/jwt-auth.guard.ts`
- Create: `backend/src/auth/dto/register.dto.ts`
- Create: `backend/src/auth/dto/login.dto.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create User entity**

Write to `backend/src/users/user.entity.ts`:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Create UsersService**

Write to `backend/src/users/users.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async create(email: string, passwordHash: string): Promise<User> {
    const user = this.repo.create({ email, passwordHash });
    return this.repo.save(user);
  }
}
```

- [ ] **Step 3: Create UsersModule**

Write to `backend/src/users/users.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 4: Create DTOs**

Write to `backend/src/auth/dto/register.dto.ts`:

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

Write to `backend/src/auth/dto/login.dto.ts`:

```typescript
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

- [ ] **Step 5: Create AuthService**

Write to `backend/src/auth/auth.service.ts`:

```typescript
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string) {
    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new ConflictException('Email already registered');
    const hash = await bcrypt.hash(password, 10);
    const user = await this.usersService.create(email, hash);
    return { accessToken: this.jwtService.sign({ sub: user.id, email: user.email }) };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return { accessToken: this.jwtService.sign({ sub: user.id, email: user.email }) };
  }
}
```

- [ ] **Step 6: Create JWT Strategy + Guard**

Write to `backend/src/auth/jwt.strategy.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'change-me-in-production',
    });
  }

  validate(payload: { sub: string; email: string }) {
    return { userId: payload.sub, email: payload.email };
  }
}
```

Write to `backend/src/auth/jwt-auth.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 7: Create AuthController**

Write to `backend/src/auth/auth.controller.ts`:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}
```

- [ ] **Step 8: Create AuthModule**

Write to `backend/src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-me-in-production',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 9: Update AppModule**

Update `backend/src/app.module.ts` imports to include AuthModule:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(databaseConfig()),
    AuthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 10: Enable synchronize temporarily for dev**

In `backend/src/config/database.config.ts`, set `synchronize: true` temporarily so TypeORM creates the users table.

- [ ] **Step 11: Test auth endpoints**

```bash
cd /Users/nishantgupta/Documents/noop/backend
npm run start:dev &
sleep 3

# Register
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@noop.dev","password":"testpass123"}' | jq .

# Login
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@noop.dev","password":"testpass123"}' | jq .
```

Expected: Both return `{ "accessToken": "eyJ..." }`

- [ ] **Step 12: Commit**

```bash
git add backend/src/users backend/src/auth
git commit -m "feat(backend): add user auth with JWT register/login"
```

---

### Task 3: Time-Series Entities (Sleep, Wellness, Signals)

**Files:**
- Create: `backend/src/sleep/entities/sleep-detection.entity.ts`
- Create: `backend/src/sleep/entities/sleep-stage.entity.ts`
- Create: `backend/src/sleep/entities/night-feature.entity.ts`
- Create: `backend/src/wellness/entities/daily-score.entity.ts`
- Create: `backend/src/wellness/entities/daily-metric.entity.ts`
- Create: `backend/src/wellness/entities/signal-sample.entity.ts`
- Create: `backend/src/journal/journal-entry.entity.ts`
- Create: `backend/src/plans/sleep-plan.entity.ts`
- Create: `backend/src/plans/baseline-profile.entity.ts`
- Create: `backend/src/devices/device.entity.ts`

- [ ] **Step 1: Create sleep entities**

Write to `backend/src/sleep/entities/sleep-detection.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('sleep_detections')
@Index(['userId', 'nightDate'])
export class SleepDetection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('timestamptz')
  nightDate: Date;

  @Column('timestamptz', { nullable: true })
  bedtime: Date;

  @Column('timestamptz', { nullable: true })
  wakeTime: Date;

  @Column('double precision', { default: 0 })
  durationHours: number;

  @Column('int', { default: 0 })
  interruptionCount: number;

  @Column('double precision', { default: 0 })
  continuity: number;

  @Column('double precision', { default: 0 })
  regularity: number;

  @Column('double precision', { default: 0 })
  validCoverage: number;

  @Column('double precision', { default: 0 })
  confidence: number;
}
```

Write to `backend/src/sleep/entities/sleep-stage.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('sleep_stages')
@Index(['userId', 'nightDate'])
export class SleepStage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('timestamptz')
  nightDate: Date;

  @Column('int', { default: 0 })
  remMinutes: number;

  @Column('int', { default: 0 })
  coreMinutes: number;

  @Column('int', { default: 0 })
  deepMinutes: number;

  @Column('int', { default: 0 })
  awakeMinutes: number;

  @Column('int', { default: 0 })
  unknownMinutes: number;

  @Column('double precision', { default: 0 })
  confidence: number;

  @Column({ default: 'Strap' })
  source: string;

  @Column('jsonb', { nullable: true })
  epochTimeline: object;

  @Column('int', { default: 1 })
  epochMinutes: number;
}
```

Write to `backend/src/sleep/entities/night-feature.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('night_features')
@Index(['userId', 'nightDate'])
export class NightFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('timestamptz')
  nightDate: Date;

  @Column('double precision', { default: 0 })
  restingHeartRate: number;

  @Column('double precision', { default: 0 })
  rmssd: number;

  @Column('double precision', { default: 0 })
  sdnn: number;

  @Column('double precision', { default: 0 })
  respiratoryRate: number;

  @Column('double precision', { default: 0 })
  continuity: number;

  @Column('double precision', { default: 0 })
  regularity: number;

  @Column('double precision', { default: 0 })
  validCoverage: number;

  @Column('double precision', { default: 0 })
  confidenceRaw: number;

  @Column('double precision', { default: 0 })
  sleepEstimateHours: number;

  @Column({ default: 'Unknown' })
  sourceBlend: string;
}
```

- [ ] **Step 2: Create wellness entities**

Write to `backend/src/wellness/entities/daily-score.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('daily_scores')
@Index(['userId', 'dayDate'])
export class DailyScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('timestamptz')
  dayDate: Date;

  @Column('int', { default: 0 })
  dailyBalance: number;

  @Column('int', { default: 0 })
  loadPressure: number;

  @Column('double precision', { default: 0 })
  sleepReserveHours: number;

  @Column({ default: 'Low' })
  confidence: string;

  @Column({ default: 'Steady' })
  recommendation: string;

  @Column('text', { default: '' })
  detail: string;
}
```

Write to `backend/src/wellness/entities/daily-metric.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('daily_metrics')
@Index(['userId', 'dayDate'])
export class DailyMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('timestamptz')
  dayDate: Date;

  @Column('double precision', { nullable: true })
  stressAverage: number;

  @Column('double precision', { nullable: true })
  spo2Average: number;

  @Column('double precision', { nullable: true })
  skinTempAvgCelsius: number;

  @Column('double precision', { nullable: true })
  skinTempDeltaCelsius: number;

  @Column('double precision', { nullable: true })
  strainScore: number;

  @Column('double precision', { nullable: true })
  sleepConsistencyScore: number;

  @Column('int', { default: 0 })
  detectedSleepNights: number;
}
```

Write to `backend/src/wellness/entities/signal-sample.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('signal_samples')
@Index(['userId', 'timestamp'])
export class SignalSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('timestamptz')
  timestamp: Date;

  @Column({ default: 'strap' })
  source: string;

  @Column('double precision', { nullable: true })
  heartRate: number;

  @Column('double precision', { nullable: true })
  ibiMs: number;

  @Column('double precision', { nullable: true })
  motionScore: number;

  @Column('double precision', { nullable: true })
  qualityScore: number;
}
```

- [ ] **Step 3: Create remaining entities**

Write to `backend/src/journal/journal-entry.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('journal_entries')
@Index(['userId', 'timestamp'])
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('timestamptz')
  timestamp: Date;

  @Column()
  factorTag: string;

  @Column('int')
  intensity: number;

  @Column('text', { default: '' })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

Write to `backend/src/plans/sleep-plan.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('sleep_plans')
export class SleepPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { unique: true })
  userId: string;

  @Column('int', { default: 480 })
  targetSleepMinutes: number;

  @Column('int', { default: 420 })
  wakeMinutes: number;

  @Column('boolean', { default: false })
  alarmEnabled: boolean;

  @Column('int', { default: 420 })
  alarmMinutes: number;

  @Column('boolean', { default: false })
  smartWakeEnabled: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

Write to `backend/src/plans/baseline-profile.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('baseline_profiles')
export class BaselineProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { unique: true })
  userId: string;

  @Column('double precision', { default: 0 })
  restingHeartRate: number;

  @Column('double precision', { default: 0 })
  rmssd: number;

  @Column('double precision', { default: 0 })
  sdnn: number;

  @Column('int', { default: 0 })
  nightsUsed: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

Write to `backend/src/devices/device.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column()
  deviceName: string;

  @Column({ nullable: true })
  strapSerial: string;

  @CreateDateColumn()
  pairedAt: Date;
}
```

- [ ] **Step 4: Verify tables are created**

Restart the dev server (with `synchronize: true`), then:

```bash
docker exec -it $(docker ps -q -f ancestor=timescale/timescaledb:latest-pg16) psql -U noop -c "\dt"
```

Expected: All 11 tables listed (users, devices, sleep_detections, sleep_stages, night_features, daily_scores, daily_metrics, signal_samples, journal_entries, sleep_plans, baseline_profiles).

- [ ] **Step 5: Commit**

```bash
git add backend/src/sleep backend/src/wellness backend/src/journal backend/src/plans backend/src/devices
git commit -m "feat(backend): add all TypeORM entities for sleep, wellness, journal, devices"
```

---

### Task 4: Sync Module (Push + Pull)

**Files:**
- Create: `backend/src/sync/sync.module.ts`
- Create: `backend/src/sync/sync.controller.ts`
- Create: `backend/src/sync/sync.service.ts`
- Create: `backend/src/sync/dto/push-sync.dto.ts`
- Create: `backend/src/sleep/sleep.module.ts`
- Create: `backend/src/wellness/wellness.module.ts`
- Create: `backend/src/journal/journal.module.ts`
- Create: `backend/src/plans/plans.module.ts`
- Create: `backend/src/devices/devices.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create feature modules**

Write to `backend/src/sleep/sleep.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SleepDetection } from './entities/sleep-detection.entity';
import { SleepStage } from './entities/sleep-stage.entity';
import { NightFeature } from './entities/night-feature.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SleepDetection, SleepStage, NightFeature])],
  exports: [TypeOrmModule],
})
export class SleepModule {}
```

Write to `backend/src/wellness/wellness.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyScore } from './entities/daily-score.entity';
import { DailyMetric } from './entities/daily-metric.entity';
import { SignalSample } from './entities/signal-sample.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DailyScore, DailyMetric, SignalSample])],
  exports: [TypeOrmModule],
})
export class WellnessModule {}
```

Write to `backend/src/journal/journal.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry } from './journal-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([JournalEntry])],
  exports: [TypeOrmModule],
})
export class JournalModule {}
```

Write to `backend/src/plans/plans.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SleepPlan } from './sleep-plan.entity';
import { BaselineProfile } from './baseline-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SleepPlan, BaselineProfile])],
  exports: [TypeOrmModule],
})
export class PlansModule {}
```

Write to `backend/src/devices/devices.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './device.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Device])],
  exports: [TypeOrmModule],
})
export class DevicesModule {}
```

- [ ] **Step 2: Create push-sync DTO**

Write to `backend/src/sync/dto/push-sync.dto.ts`:

```typescript
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class NightFeatureDto {
  nightDate: string;
  restingHeartRate: number;
  rmssd: number;
  sdnn: number;
  respiratoryRate: number;
  continuity: number;
  regularity: number;
  validCoverage: number;
  confidenceRaw: number;
  sleepEstimateHours: number;
  sourceBlend: string;
}

class SleepDetectionDto {
  nightDate: string;
  bedtime: string;
  wakeTime: string;
  durationHours: number;
  interruptionCount: number;
  continuity: number;
  regularity: number;
  validCoverage: number;
  confidence: number;
}

class SleepStageDto {
  nightDate: string;
  remMinutes: number;
  coreMinutes: number;
  deepMinutes: number;
  awakeMinutes: number;
  unknownMinutes: number;
  confidence: number;
  source: string;
  epochTimeline?: object;
  epochMinutes?: number;
}

class DailyScoreDto {
  dayDate: string;
  dailyBalance: number;
  loadPressure: number;
  sleepReserveHours: number;
  confidence: string;
  recommendation: string;
  detail: string;
}

class DailyMetricDto {
  dayDate: string;
  stressAverage?: number;
  spo2Average?: number;
  skinTempAvgCelsius?: number;
  skinTempDeltaCelsius?: number;
  strainScore?: number;
  sleepConsistencyScore?: number;
  detectedSleepNights?: number;
}

class JournalEntryDto {
  timestamp: string;
  factorTag: string;
  intensity: number;
  note?: string;
}

class SleepPlanDto {
  targetSleepMinutes: number;
  wakeMinutes: number;
  alarmEnabled: boolean;
  alarmMinutes: number;
  smartWakeEnabled: boolean;
}

class BaselineProfileDto {
  restingHeartRate: number;
  rmssd: number;
  sdnn: number;
  nightsUsed: number;
}

export class PushSyncDto {
  @IsOptional() @IsArray() nightFeatures?: NightFeatureDto[];
  @IsOptional() @IsArray() sleepDetections?: SleepDetectionDto[];
  @IsOptional() @IsArray() sleepStages?: SleepStageDto[];
  @IsOptional() @IsArray() dailyScores?: DailyScoreDto[];
  @IsOptional() @IsArray() dailyMetrics?: DailyMetricDto[];
  @IsOptional() @IsArray() journalEntries?: JournalEntryDto[];
  @IsOptional() sleepPlan?: SleepPlanDto;
  @IsOptional() baselineProfile?: BaselineProfileDto;
}
```

- [ ] **Step 3: Create SyncService**

Write to `backend/src/sync/sync.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { SleepDetection } from '../sleep/entities/sleep-detection.entity';
import { SleepStage } from '../sleep/entities/sleep-stage.entity';
import { NightFeature } from '../sleep/entities/night-feature.entity';
import { DailyScore } from '../wellness/entities/daily-score.entity';
import { DailyMetric } from '../wellness/entities/daily-metric.entity';
import { JournalEntry } from '../journal/journal-entry.entity';
import { SleepPlan } from '../plans/sleep-plan.entity';
import { BaselineProfile } from '../plans/baseline-profile.entity';
import { PushSyncDto } from './dto/push-sync.dto';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(SleepDetection) private sleepDetectionRepo: Repository<SleepDetection>,
    @InjectRepository(SleepStage) private sleepStageRepo: Repository<SleepStage>,
    @InjectRepository(NightFeature) private nightFeatureRepo: Repository<NightFeature>,
    @InjectRepository(DailyScore) private dailyScoreRepo: Repository<DailyScore>,
    @InjectRepository(DailyMetric) private dailyMetricRepo: Repository<DailyMetric>,
    @InjectRepository(JournalEntry) private journalRepo: Repository<JournalEntry>,
    @InjectRepository(SleepPlan) private sleepPlanRepo: Repository<SleepPlan>,
    @InjectRepository(BaselineProfile) private baselineRepo: Repository<BaselineProfile>,
  ) {}

  async push(userId: string, dto: PushSyncDto) {
    const upserted: Record<string, number> = {};

    if (dto.nightFeatures?.length) {
      for (const nf of dto.nightFeatures) {
        await this.nightFeatureRepo.upsert(
          { userId, nightDate: new Date(nf.nightDate), ...nf, nightDate: new Date(nf.nightDate) },
          { conflictPaths: [], skipUpdateIfNoValuesChanged: true },
        );
      }
      // Simple approach: delete existing for user+date, then insert
      for (const nf of dto.nightFeatures) {
        const nightDate = new Date(nf.nightDate);
        await this.nightFeatureRepo.delete({ userId, nightDate });
        await this.nightFeatureRepo.save(this.nightFeatureRepo.create({ userId, nightDate, ...nf, nightDate }));
      }
      upserted.nightFeatures = dto.nightFeatures.length;
    }

    if (dto.sleepDetections?.length) {
      for (const sd of dto.sleepDetections) {
        const nightDate = new Date(sd.nightDate);
        await this.sleepDetectionRepo.delete({ userId, nightDate });
        await this.sleepDetectionRepo.save(this.sleepDetectionRepo.create({
          userId, nightDate,
          bedtime: new Date(sd.bedtime), wakeTime: new Date(sd.wakeTime),
          durationHours: sd.durationHours, interruptionCount: sd.interruptionCount,
          continuity: sd.continuity, regularity: sd.regularity,
          validCoverage: sd.validCoverage, confidence: sd.confidence,
        }));
      }
      upserted.sleepDetections = dto.sleepDetections.length;
    }

    if (dto.sleepStages?.length) {
      for (const ss of dto.sleepStages) {
        const nightDate = new Date(ss.nightDate);
        await this.sleepStageRepo.delete({ userId, nightDate });
        await this.sleepStageRepo.save(this.sleepStageRepo.create({
          userId, nightDate,
          remMinutes: ss.remMinutes, coreMinutes: ss.coreMinutes,
          deepMinutes: ss.deepMinutes, awakeMinutes: ss.awakeMinutes,
          unknownMinutes: ss.unknownMinutes, confidence: ss.confidence,
          source: ss.source, epochTimeline: ss.epochTimeline, epochMinutes: ss.epochMinutes ?? 1,
        }));
      }
      upserted.sleepStages = dto.sleepStages.length;
    }

    if (dto.dailyScores?.length) {
      for (const ds of dto.dailyScores) {
        const dayDate = new Date(ds.dayDate);
        await this.dailyScoreRepo.delete({ userId, dayDate });
        await this.dailyScoreRepo.save(this.dailyScoreRepo.create({ userId, dayDate, ...ds, dayDate }));
      }
      upserted.dailyScores = dto.dailyScores.length;
    }

    if (dto.dailyMetrics?.length) {
      for (const dm of dto.dailyMetrics) {
        const dayDate = new Date(dm.dayDate);
        await this.dailyMetricRepo.delete({ userId, dayDate });
        await this.dailyMetricRepo.save(this.dailyMetricRepo.create({ userId, dayDate, ...dm, dayDate }));
      }
      upserted.dailyMetrics = dto.dailyMetrics.length;
    }

    if (dto.journalEntries?.length) {
      for (const je of dto.journalEntries) {
        const timestamp = new Date(je.timestamp);
        await this.journalRepo.delete({ userId, timestamp });
        await this.journalRepo.save(this.journalRepo.create({ userId, timestamp, ...je, timestamp }));
      }
      upserted.journalEntries = dto.journalEntries.length;
    }

    if (dto.sleepPlan) {
      const existing = await this.sleepPlanRepo.findOne({ where: { userId } });
      if (existing) {
        Object.assign(existing, dto.sleepPlan);
        await this.sleepPlanRepo.save(existing);
      } else {
        await this.sleepPlanRepo.save(this.sleepPlanRepo.create({ userId, ...dto.sleepPlan }));
      }
      upserted.sleepPlan = 1;
    }

    if (dto.baselineProfile) {
      const existing = await this.baselineRepo.findOne({ where: { userId } });
      if (existing) {
        Object.assign(existing, dto.baselineProfile);
        await this.baselineRepo.save(existing);
      } else {
        await this.baselineRepo.save(this.baselineRepo.create({ userId, ...dto.baselineProfile }));
      }
      upserted.baselineProfile = 1;
    }

    return { ok: true, upserted };
  }

  async pull(userId: string, since?: string) {
    const sinceDate = since ? new Date(since) : new Date(0);
    const where = { userId };

    return {
      nightFeatures: await this.nightFeatureRepo.find({ where, order: { nightDate: 'ASC' } }),
      sleepDetections: await this.sleepDetectionRepo.find({ where, order: { nightDate: 'ASC' } }),
      sleepStages: await this.sleepStageRepo.find({ where, order: { nightDate: 'ASC' } }),
      dailyScores: await this.dailyScoreRepo.find({ where, order: { dayDate: 'ASC' } }),
      dailyMetrics: await this.dailyMetricRepo.find({ where, order: { dayDate: 'ASC' } }),
      journalEntries: await this.journalRepo.find({ where, order: { timestamp: 'ASC' } }),
      sleepPlan: await this.sleepPlanRepo.findOne({ where: { userId } }),
      baselineProfile: await this.baselineRepo.findOne({ where: { userId } }),
    };
  }
}
```

- [ ] **Step 4: Create SyncController**

Write to `backend/src/sync/sync.controller.ts`:

```typescript
import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SyncService } from './sync.service';
import { PushSyncDto } from './dto/push-sync.dto';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  push(@Request() req, @Body() dto: PushSyncDto) {
    return this.syncService.push(req.user.userId, dto);
  }

  @Get('pull')
  pull(@Request() req, @Query('since') since?: string) {
    return this.syncService.pull(req.user.userId, since);
  }
}
```

- [ ] **Step 5: Create SyncModule**

Write to `backend/src/sync/sync.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SleepModule } from '../sleep/sleep.module';
import { WellnessModule } from '../wellness/wellness.module';
import { JournalModule } from '../journal/journal.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [SleepModule, WellnessModule, JournalModule, PlansModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
```

- [ ] **Step 6: Update AppModule with all modules**

Replace `backend/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { SyncModule } from './sync/sync.module';
import { SleepModule } from './sleep/sleep.module';
import { WellnessModule } from './wellness/wellness.module';
import { JournalModule } from './journal/journal.module';
import { PlansModule } from './plans/plans.module';
import { DevicesModule } from './devices/devices.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(databaseConfig()),
    AuthModule,
    SyncModule,
    SleepModule,
    WellnessModule,
    JournalModule,
    PlansModule,
    DevicesModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Test sync endpoints**

```bash
# Register and get token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"sync@noop.dev","password":"testpass123"}' | jq -r .accessToken)

# Push sample data
curl -s -X POST http://localhost:3000/sync/push \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "sleepDetections": [{
      "nightDate": "2026-04-04T00:00:00Z",
      "bedtime": "2026-04-03T23:30:00Z",
      "wakeTime": "2026-04-04T07:15:00Z",
      "durationHours": 7.75,
      "interruptionCount": 1,
      "continuity": 0.85,
      "regularity": 0.8,
      "validCoverage": 0.9,
      "confidence": 0.82
    }]
  }' | jq .

# Pull data back
curl -s http://localhost:3000/sync/pull \
  -H "Authorization: Bearer $TOKEN" | jq .sleepDetections
```

Expected: Push returns `{ ok: true, upserted: { sleepDetections: 1 } }`. Pull returns the detection.

- [ ] **Step 8: Commit**

```bash
git add backend/src/sync backend/src/sleep backend/src/wellness backend/src/journal backend/src/plans backend/src/devices backend/src/app.module.ts
git commit -m "feat(backend): add sync push/pull endpoints with all entity modules"
```

---

### Task 5: Dockerfile + Cloud Run Deployment

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Create Dockerfile**

Write to `backend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/main"]
```

- [ ] **Step 2: Create .dockerignore**

Write to `backend/.dockerignore`:

```
node_modules
dist
.env
.git
```

- [ ] **Step 3: Test Docker build locally**

```bash
cd /Users/nishantgupta/Documents/noop/backend
docker build -t noop-api .
docker run --rm -p 3001:3000 \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_USER=noop \
  -e DB_PASSWORD=noop_dev \
  -e DB_NAME=noop \
  -e JWT_SECRET=test-secret \
  noop-api &
sleep 3
curl -s http://localhost:3001/auth/login -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@noop.dev","password":"testpass123"}'
```

Expected: Returns JWT or 401 (depends on whether user exists in DB).

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat(backend): add Dockerfile for Cloud Run deployment"
```

---

## Summary

| Task | What it builds | Key endpoints |
|------|---------------|---------------|
| 1 | NestJS scaffold + Docker Compose + TimescaleDB | - |
| 2 | User auth (register/login/JWT) | POST /auth/register, /auth/login |
| 3 | All 11 TypeORM entities | - |
| 4 | Sync push/pull + all feature modules | POST /sync/push, GET /sync/pull |
| 5 | Docker + Cloud Run ready | - |
