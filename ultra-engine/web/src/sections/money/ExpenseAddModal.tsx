import { useState } from 'react';
import { DetailDrawer } from '@/ui/DetailDrawer';
import { useToast } from '@/ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type TxType = 'expense' | 'income';

const CATEGORIES_EXPENSE: ReadonlyArray<string> = [
  'groceries',
  'eating_out',
  'fuel',
  'campsites',
  'transport',
  'phone',
  'subscriptions',
  'insurance_van',
  'insurance_health',
  'vehicle_maintenance',
  'bureaucracy',
  'other',
];

const CATEGORIES_INCOME: ReadonlyArray<string> = [
  'salary',
  'freelance',
  'grant',
  'gift',
  'crypto_gain',
  'other',
];

const ACCOUNTS: ReadonlyArray<string> = [
  'Cash',
  'ASB Everyday',
  'Wise NZD',
  'Wise EUR',
  'Wise USD',
  'Revolut EUR',
  'Binance',
];

const CURRENCIES: ReadonlyArray<string> = ['NZD', 'EUR', 'USD', 'AUD', 'GBP', 'JPY'];

async function createExpense(payload: {
  type: TxType;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  currency: string;
  account: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/finances', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

export function ExpenseAddModal({ open, onClose, onCreated }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('groceries');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);
  const [currency, setCurrency] = useState('NZD');
  const [account, setAccount] = useState('Cash');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const cats = type === 'expense' ? CATEGORIES_EXPENSE : CATEGORIES_INCOME;

  const reset = () => {
    setType('expense');
    setAmount('');
    setCategory('groceries');
    setDescription('');
    setDate(today);
    setCurrency('NZD');
    setAccount('Cash');
    setErr(null);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) {
      setErr('Amount debe ser un número > 0');
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await createExpense({
      type,
      amount: n,
      category,
      description: description.trim() || null,
      date,
      currency,
      account,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(
        `${type === 'expense' ? 'Gasto' : 'Ingreso'} ${n.toFixed(2)} ${currency} guardado`,
      );
      onCreated();
      reset();
      onClose();
    } else {
      setErr(res.error);
      toast.error(`Error: ${res.error}`);
    }
  };

  return (
    <DetailDrawer
      open={open}
      onClose={handleClose}
      title={type === 'expense' ? 'Nuevo gasto' : 'Nuevo ingreso'}
      testId="expense-add-drawer"
      actions={
        <>
          <button
            type="button"
            onClick={handleClose}
            className="rounded border border-border px-3 py-1 text-meta text-fg hover:border-accent"
          >
            cancelar
          </button>
          <span className="flex-1" />
          <button
            type="button"
            data-testid="expense-add-submit"
            disabled={busy}
            onClick={handleSubmit}
            className="rounded border border-accent bg-accent/10 px-3 py-1 text-meta text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {busy ? 'enviando…' : 'guardar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1">
          {(['expense', 'income'] as const).map((v) => (
            <button
              key={v}
              type="button"
              data-testid={`expense-type-${v}`}
              onClick={() => {
                setType(v);
                setCategory(v === 'expense' ? 'groceries' : 'salary');
              }}
              className={
                type === v
                  ? 'flex-1 rounded border border-accent bg-accent/10 px-3 py-2 text-card-title text-accent'
                  : 'flex-1 rounded border border-border px-3 py-2 text-card-title text-fg-muted hover:border-accent'
              }
            >
              {v === 'expense' ? '− Gasto' : '+ Ingreso'}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col text-meta text-fg-muted">
            <span className="mb-1">Cantidad *</span>
            <input
              data-testid="expense-amount"
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg placeholder:text-fg-dim focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex w-[100px] flex-col text-meta text-fg-muted">
            <span className="mb-1">Moneda</span>
            <select
              data-testid="expense-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Categoría *</span>
          <select
            data-testid="expense-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          >
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col text-meta text-fg-muted">
            <span className="mb-1">Fecha</span>
            <input
              data-testid="expense-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col text-meta text-fg-muted">
            <span className="mb-1">Cuenta</span>
            <select
              data-testid="expense-account"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
            >
              {ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Descripción</span>
          <input
            data-testid="expense-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
            placeholder="ej. café con Pedro, supermercado, etc."
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg placeholder:text-fg-dim focus:border-accent focus:outline-none"
          />
        </label>

        {err && (
          <p role="alert" className="text-meta text-critical">
            {err}
          </p>
        )}
        <p className="text-meta text-fg-dim">
          Se reflejará en Money KPIs + bridge a Firefly III (si configurado).
        </p>
      </div>
    </DetailDrawer>
  );
}
