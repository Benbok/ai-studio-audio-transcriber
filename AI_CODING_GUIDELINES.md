# AI CODING GUIDELINES - PediAssist
**Краткая выжимка для AI агентов**

## 🎯 CORE PRINCIPLES

### 1. Architecture Layers (ОБЯЗАТЕЛЬНО СОБЛЮДАТЬ!)

```
Component (*.tsx)     → UI только, NO business logic
       ↓
Service (*.service.ts) → ALL business logic + Zod validation + IPC calls
       ↓
IPC Handler (*.cjs)    → auth middleware + Zod validation + simple DB ops
       ↓
Database (Prisma)      → data storage
```

### 2. Validation Strategy: ДВОЙНАЯ

```typescript
// Frontend Service
const validated = Schema.parse(data); // ← 1st validation (UX)
await window.electronAPI.method(validated);

// Backend IPC
ipcMain.handle('method', ensureAuthenticated(async (_, data) => {
  const validated = Schema.parse(data); // ← 2nd validation (Security)
}));
```

**WHY TWICE?** Frontend = UX, Backend = Security (defense in depth)

---

## 🔴 CRITICAL RULES (NEVER VIOLATE)

### Security

```typescript
// ❌ NEVER
try { } catch (error) { console.log(error); }
traceback.print_exc(); // FORBIDDEN

// ✅ ALWAYS
const { logger } = require('./logger.cjs');
try { } catch (error) { 
  logger.error('[Module] Failed:', error);
  throw error;
}
```

```typescript
// ❌ NEVER: Trust frontend data
ipcMain.handle('db:create', async (_, data) => {
  return await prisma.create({ data }); // DANGEROUS!
});

// ✅ ALWAYS: Validate + Auth
ipcMain.handle('db:create', ensureAuthenticated(async (_, data) => {
  const validated = Schema.parse(data);
  return await prisma.create({ data: validated });
}));
```

### Transactions

```typescript
// ❌ NEVER: Related operations without transaction
await prisma.child.create({ data });
await prisma.profile.create({ data }); // If fails → orphan!

// ✅ ALWAYS: Use transactions
await prisma.$transaction(async (tx) => {
  const child = await tx.child.create({ data });
  await tx.profile.create({ data: { childId: child.id } });
});
```

### Data Parsing & JSON Fields

```javascript
// ❌ NEVER: Double-parse JSON data
// Service already returns parsed arrays
const disease = await DiseaseService.getById(id);
const parsed = {
  ...disease,
  diagnosticPlan: JSON.parse(disease.diagnosticPlan), // ← WRONG! Already parsed!
};

// ✅ ALWAYS: Parse once at data boundary
// Service.cjs - parse when reading from DB
const disease = await prisma.disease.findUnique({ where: { id } });
return {
  ...disease,
  diagnosticPlan: JSON.parse(disease.diagnosticPlan || '[]'), // ← Parse here
};

// IPC Handler - NO parsing, just pass through
const disease = await DiseaseService.getById(id);
return disease; // ← Already parsed, just return

// Frontend - NO parsing, data is ready
const data = await diseaseService.getDisease(id);
setFormData(data.diagnosticPlan); // ← Already array
```

**RULE**: Parse JSON strings at the **DATA BOUNDARY** (where you read from DB), never in handlers or components!

### Derived / filtered lists (no infinite update loops)

**Проблема:** Если отфильтрованный список хранить в `useState` и обновлять в `useEffect` при изменении исходных данных или критериев фильтра, возможен бесконечный цикл обновлений (Maximum update depth exceeded). Причина: зависимости эффекта (например `items ?? []`) создают новую ссылку на каждый рендер → эффект срабатывает → setState → ре-рендер → снова новая ссылка → цикл.

```typescript
// ❌ NEVER: filtered list in state + useEffect that sets it
const [items, setItems] = useState<Item[]>([]);
const [filtered, setFiltered] = useState<Item[]>([]);
const source = cachedItems ?? [];  // новая ссылка [] каждый рендер при null!
useEffect(() => { setFiltered(applyFilter(source)); }, [source, searchTerm]); // → infinite loop
```

```typescript
// ✅ ALWAYS: derived/filtered list via useMemo (no setState, stable deps)
const source = cachedItems ?? [];
const filteredItems = useMemo(() => {
  let result = source;
  if (searchTerm.trim()) result = result.filter(...);
  if (filterByX) result = result.filter(...);
  return result;
}, [source, searchTerm, filterByX]); // примитивы/стабильные ссылки — цикла нет
```

**RULE:** Любой список, который является **производным** от другого (фильтрация, поиск, сортировка) — считать через **useMemo** с явными зависимостями. Не хранить производный список в `useState` и не обновлять его в `useEffect` по изменению исходных данных.

---

## 📋 MANDATORY PATTERNS

### Component Pattern

```typescript
// ❌ BAD: Business logic in component
const MyComponent = () => {
  const handleSave = async () => {
    // 50 lines of validation, calculations, IPC...
    const validated = ChildProfileSchema.parse(formData);
    await window.electronAPI.createChild(validated);
  };
};

// ✅ GOOD: Delegate to service
const MyComponent = () => {
  const handleSave = async () => {
    try {
      await patientService.createChild(formData);
    } catch (error) {
      setError(error.message);
    }
  };
};
```

### Service Pattern

```typescript
// src/services/feature.service.ts

export const featureService = {
  async create(data: Input): Promise<Output> {
    // 1. Validate
    const validated = Schema.parse(data);
    
    // 2. IPC call
    const result = await window.electronAPI.createFeature(validated);
    
    // 3. Return typed
    return result;
  },
  
  // Helper functions
  calculateSomething(data: Type): number {
    // Business logic here
  }
};
```

### IPC Handler Pattern

```javascript
// electron/database.cjs

ipcMain.handle('db:create-feature', ensureAuthenticated(async (_, data) => {
  try {
    // 1. Validate
    const validated = Schema.parse(data);
    
    // 2. DB operation
    const result = await prisma.feature.create({ data: validated });
    
    // 3. Audit
    logAudit('FEATURE_CREATED', { id: result.id });
    
    // 4. Return
    return result;
  } catch (error) {
    logger.error('[DB] Create failed:', error);
    if (error instanceof z.ZodError) {
      throw new Error(error.errors.map(e => e.message).join(', '));
    }
    throw error;
  }
}));
```

### Caching (Backend)

При добавлении новых IPC handlers, работающих с часто читаемыми данными, подключайте **CacheService** (`electron/services/cacheService.cjs`):

- **Чтение (GET):** в начале handler — `CacheService.get(namespace, key)`; при промахе — запрос к Prisma, приведение к формату API, `CacheService.set(namespace, key, parsed)`, возврат.
- **Запись (CREATE/UPDATE/DELETE):** после мутации либо **invalidate-only** — `CacheService.invalidate(namespace, key)` (и связанные ключи, например списки), либо **write-through** — перечитать данные из БД и вызвать `CacheService.set(...)`.
- **Namespace и ключи:** используйте существующий namespace из `NAMESPACE_CONFIG` или добавьте новый с TTL; ключи — по соглашениям (например `entity_${id}`, `user_${userId}_admin_${bool}`). При инвалидации используйте тот же формат ключа, что и при `set`.

Подробно: [electron/services/README-cache-service.md](electron/services/README-cache-service.md) — карта namespace, паттерны read-through/write-through, соглашения по ключам, как добавить кеш в новый handler.

---

## 📂 FILE STRUCTURE

| Type | Location | Example |
|------|----------|---------|
| Page/Module | `src/modules/<name>/` | `PatientsModule.tsx` |
| Reusable UI | `src/components/` | `Button.tsx` |
| Business Logic | `src/services/` | `patient.service.ts` |
| Pure Functions | `src/logic/` | `calculateSchedule()` |
| Validation | `src/validators/` | `child.validator.ts` |
| IPC Handlers | `electron/` | `database.cjs` |
| Constants | `src/constants.ts` | `VACCINE_SCHEDULE` |
| Types | `src/types.ts` | `ChildProfile` |

---

## 🚫 FORBIDDEN

1. **Magic numbers**: Use `constants.ts`
   ```typescript
   // ❌ const limit = 18;
   // ✅ const limit = INFANT_AGE_THRESHOLD_MONTHS;
   ```

2. **Business logic in Components**: Move to Service
3. **Direct IPC calls from Components**: Use Service
4. **console.log in production**: Use `logger`
5. **Missing Type Hints**: All functions must have types
6. **Duplicated code** (>5 lines): Extract to util/service
7. **Missing authentication**: All IPC handlers need `ensureAuthenticated`
8. **Filtered/derived list in useState + useEffect**: Use `useMemo` for any list derived from props/state (search, filter, sort) to avoid "Maximum update depth exceeded".

---

## 📏 SIZE LIMITS

- **File**: < 500 lines → Split into modules
- **Component**: < 300 lines → Extract sub-components
- **Function**: < 50 lines → Break into smaller functions
- **DB operation**: < 20 lines → Move to Service

---

## ✅ CHECKLIST (Before Code)

When writing new code, ensure:

- [ ] Type hints on ALL functions
- [ ] Validation with Zod (Frontend + Backend)
- [ ] Authentication (`ensureAuthenticated`) on IPC handlers
- [ ] Logging (`logger.*`) instead of `console.*`
- [ ] Audit trail (`logAudit`) for CRUD operations
- [ ] Transactions for related DB operations
- [ ] No magic numbers (use `constants.ts`)
- [ ] Code in correct layer (Component/Service/IPC/DB)
- [ ] Новые GET/mutation handlers с частыми чтениями — кеширование через CacheService (см. [README-cache-service.md](electron/services/README-cache-service.md))
- [ ] Производные списки (поиск/фильтр) — через `useMemo`, не через `useState` + `useEffect`

---

## 🧪 TESTING RULES

### When to write tests?

- ✅ **ALWAYS**: New medical logic in `src/logic/vax/`
- ✅ **ALWAYS**: New validation rules
- ⚠️ **RECOMMENDED**: New service methods
- ⚠️ **RECOMMENDED**: Complex UI interactions

### Test structure:

```typescript
// src/logic/vax/feature.test.ts

describe('featureCalculation', () => {
  it('should handle risk group correctly', () => {
    // Arrange
    const data = setupTestData();
    
    // Act
    const result = calculate(data);
    
    // Assert
    expect(result.status).toBe(expected);
  });
});
```

---

## 🔄 NEW FEATURE WORKFLOW

**MANDATORY ORDER**:

1. **Backend**: Prisma schema → Migration
2. **Validation**: Zod schema in `validators/`
3. **Backend**: IPC handler in `database.cjs`
4. **Types**: Update `src/types.ts` (electronAPI interface)
5. **Service**: Create/update service method
6. **Frontend**: Update component to use service
7. **Tests**: Write unit/integration tests

**NEVER skip validation or authentication!**

---

## 💡 QUICK EXAMPLES

### Adding new field to Child model:

```typescript
// 1. Prisma schema
model Child {
  newField String?
}
// Run: npx prisma migrate dev

// 2. Validator
export const ChildSchema = z.object({
  newField: z.string().optional(),
});

// 3. IPC
ipcMain.handle('db:update-child', ensureAuthenticated(async (_, id, data) => {
  const validated = ChildSchema.partial().parse(data);
  return await prisma.child.update({ where: { id }, data: validated });
}));

// 4. Service
export const patientService = {
  async updateChild(id: number, data: Partial<ChildProfile>) {
    const validated = ChildSchema.partial().parse(data);
    return await window.electronAPI.updateChild(id, validated);
  }
};

// 5. Component
await patientService.updateChild(child.id, { newField: 'value' });
```

---

## 🎯 REMEMBER

1. **Component** = View only
2. **Service** = All business logic
3. **Validate** = Frontend + Backend (twice!)
4. **Authenticate** = All IPC handlers
5. **Log** = Use logger, not console
6. **Test** = Medical logic is critical
7. **Types** = Everything must be typed
8. **Unit тесты** = После каждого реализованного шага подзадачи или задачи обязательно выполняйте unit тесты для проверки базовой логики функции или модуля.
9.
- Для актуализации кода и получения контекста задачи **в начале каждого этапа реализации плана** используй mcp серверы, особенно `context7` `filesystem`, `sqlite`, `memory`:
    1. Выполни запрос к context7 для получения самой свежей информации об актуальных изменениях и состоянии кода.
    2. Используй полученный контекст для дальнейших действий, строго сверяй свои изменяемые файлы с результатом context7.
  3. Используй `filesystem` для проверки структуры и содержимого файлов проекта перед правками.
  4. Для SQL-проверок выбирай сервер по источнику данных:
     - `dev-db` для `prisma/dev.db` проекта
     - `vidal-db` для `C:/Users/Arty/Desktop/ru.medsolutions/vidal.db`
  5. Используй `memory` для фиксации важных повторяемых уроков по репозиторию.
- Пример шага для старта работы любого этапа:
    - "Синхронизировать контекст по server context7" → сопоставить с текущей постановкой задачи.

> Never начинай вносить изменения, не получив и не сверив свежий контекст из mcp context7!

---

**When in doubt**: Check existing code in `src/services/patient.service.ts` or `src/logic/vax/`.

Full details: [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md)

> **AI Agent Workflow Rule:**  
1. **Сначала** всегда читаем файл `@TASKS.md` и определяем актуальную/активную задачу.  
2. **Выполняем формулировку задачи строго по инструкции из задачи (какие файлы и участки кода изменять, как реализовать), не выходя за рамки постановки.  
3. **После выполнения** — обязательно обновляем соответствующие секции в `@README.md`, чтобы зафиксировать статус выполнения и внести отражение изменений для пользователей и команды.

*Пример базовой последовательности для AI-агента:*
- Открыть/прочитать `TASKS.md`
- Найти задачу со статусом "В работе" или "Планирование"
- Выполнить конкретные действия из описания задачи (изменить код, добавить/обновить файл и т.д.)
- Отразить результат (статус/описание) в `README.md` и других релевантных артефактах проекта

**Нельзя выполнять изменения в коде или документации, не сверившись с постановкой задачи из `TASKS.md`.**

