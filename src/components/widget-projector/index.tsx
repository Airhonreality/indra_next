'use client';

import { useState, useCallback, useId } from 'react';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FieldSchema } from '@/core/types/integration';

export type ProjectedValues = Record<string, unknown>;

interface WidgetProjectorProps {
  schema: FieldSchema[];
  defaultValues?: ProjectedValues;
  onSubmit?: (values: ProjectedValues, errors: ProjectedValues) => void;
  submitLabel?: string;
  disabled?: boolean;
  className?: string;
}

// ── CANONICAL TYPE → ZOD SCHEMA ────────────────────────────────────────────────

function buildZodSchema(schema: FieldSchema[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of schema) {
    let base: z.ZodTypeAny;
    switch (field.type) {
      case 'number':    base = z.coerce.number(); break;
      case 'boolean':   base = z.boolean(); break;
      case 'date':      base = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date'); break;
      case 'email':     base = z.email(); break;
      case 'url':       base = z.url(); break;
      case 'multi-select': base = z.array(z.string()); break;
      default:          base = z.string();
    }
    shape[field.key] = field.required ? base : base.optional();
  }
  return z.object(shape);
}

// ── FIELD RENDERER ──────────────────────────────────────────────────────────────

function FieldControl({
  field,
  value,
  error,
  onChange,
  disabled,
}: {
  field: FieldSchema;
  value: unknown;
  error?: string;
  onChange: (val: unknown) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const strVal = value == null ? '' : String(value);

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
          className="size-4 rounded border-input accent-primary cursor-pointer"
        />
        <Label htmlFor={id}>{field.label}</Label>
      </div>
    );
  }

  if (field.type === 'select' && field.options?.length) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{field.label}{field.required && <span className="text-destructive ml-0.5">*</span>}</Label>
        <Select id={id} value={strVal} onChange={e => onChange(e.target.value)} disabled={disabled} aria-invalid={!!error}>
          <option value="">— select —</option>
          {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </Select>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === 'multi-select' && field.options?.length) {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="space-y-1.5">
        <Label>{field.label}{field.required && <span className="text-destructive ml-0.5">*</span>}</Label>
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-input p-2">
          {field.options.map(opt => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => onChange(active ? selected.filter(s => s !== opt) : [...selected, opt])}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  const inputType: Record<string, string> = {
    number: 'number', date: 'date', email: 'email', url: 'url', file: 'file',
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
        <Badge variant="outline" className="ml-1.5 font-mono text-[10px]">{field.type}</Badge>
      </Label>
      <Input
        id={id}
        type={inputType[field.type] ?? 'text'}
        value={strVal}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || field.type === 'computed'}
        readOnly={field.type === 'computed'}
        placeholder={field.type === 'computed' ? 'Computed field' : `Enter ${field.label.toLowerCase()}`}
        aria-invalid={!!error}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── MAIN WIDGET PROJECTOR ───────────────────────────────────────────────────────

export function WidgetProjector({
  schema,
  defaultValues = {},
  onSubmit,
  submitLabel = 'Apply',
  disabled = false,
  className,
}: WidgetProjectorProps) {
  const [values, setValues] = useState<ProjectedValues>(() =>
    Object.fromEntries(schema.map(f => [f.key, defaultValues[f.key] ?? '']))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const zodSchema = buildZodSchema(schema);

  const setField = useCallback((key: string, val: unknown) => {
    setValues(prev => ({ ...prev, [key]: val }));
    setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = zodSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      onSubmit?.(values, fieldErrors);
    } else {
      setErrors({});
      onSubmit?.(result.data, {});
    }
  };

  const displaySchema = schema.filter(f => f.type !== 'relation'); // relations shown separately

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)} noValidate>
      {displaySchema.map(field => (
        <FieldControl
          key={field.key}
          field={field}
          value={values[field.key]}
          error={errors[field.key]}
          onChange={val => setField(field.key, val)}
          disabled={disabled}
        />
      ))}

      {schema.filter(f => f.type === 'relation').map(field => (
        <div key={field.key} className="space-y-1.5">
          <Label>{field.label}<Badge variant="outline" className="ml-1.5 text-[10px]">relation</Badge></Label>
          <Input
            value={Array.isArray(values[field.key]) ? (values[field.key] as string[]).join(', ') : String(values[field.key] ?? '')}
            onChange={e => setField(field.key, e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="Comma-separated IDs or names"
            disabled={disabled}
          />
        </div>
      ))}

      {onSubmit && (
        <Button type="submit" disabled={disabled} className="w-full">
          {submitLabel}
        </Button>
      )}
    </form>
  );
}
