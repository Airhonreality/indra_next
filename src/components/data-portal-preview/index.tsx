'use client';

/**
 * DATA PORTAL PREVIEW COMPONENT
 * Dynamic form engine that renders a UI based on an Agnostic Field Schema.
 * Used to preview how a public Ingestion Port will appear to external users.
 * 
 * Axiom: The UI does not know the destination; it only knows the data contract (Schema).
 */

import { useState, useCallback, useId } from 'react';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FieldSchema } from '@/core/types/integration';

// ── TYPES & SCHEMA DEFINITIONS ────────────────────────────────────────────────

/** Standardized data structure for portal submissions */
export type PortalSubmissionData = Record<string, unknown>;

interface DataPortalPreviewProps {
  /** The technical schema defining the required fields */
  schema: FieldSchema[];
  /** Initial values for the fields */
  initialValues?: PortalSubmissionData;
  /** Callback for data validation and submission */
  onValidate?: (values: PortalSubmissionData, errors: Record<string, string>) => void;
  /** Label for the action button */
  actionLabel?: string;
  /** Global disabled state */
  isDisabled?: boolean;
  className?: string;
}

/**
 * GENERATIVE VALIDATION LOGIC
 * Dynamically builds a Zod schema from the Agnostic Field Schema.
 */
function generateValidationSchema(fields: FieldSchema[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    let validator: z.ZodTypeAny;
    switch (field.type) {
      case 'number':    validator = z.coerce.number(); break;
      case 'boolean':   validator = z.boolean(); break;
      case 'date':      validator = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'ISO Date Required'); break;
      case 'email':     validator = z.email(); break;
      case 'url':       validator = z.url(); break;
      case 'multi-select': validator = z.array(z.string()); break;
      default:          validator = z.string();
    }
    shape[field.key] = field.required ? validator : validator.optional();
  }
  return z.object(shape);
}

// ── DYNAMIC CONTROL RENDERER ───────────────────────────────────────────────────

/**
 * Renders a specific form control based on the FieldSchema type.
 */
function GenericFormControl({
  field,
  value,
  errorMessage,
  onUpdate,
  isDisabled,
}: {
  field: FieldSchema;
  value: unknown;
  errorMessage?: string;
  onUpdate: (val: unknown) => void;
  isDisabled?: boolean;
}) {
  const controlId = useId();
  const rawValue = value == null ? '' : String(value);

  // Type: Boolean (Checkbox)
  if (field.type === 'boolean') {
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 border border-border/50">
        <input
          id={controlId}
          type="checkbox"
          checked={Boolean(value)}
          onChange={e => onUpdate(e.target.checked)}
          disabled={isDisabled}
          className="size-4 rounded accent-primary cursor-pointer"
        />
        <Label htmlFor={controlId} className="text-xs font-bold uppercase tracking-tight">{field.label}</Label>
      </div>
    );
  }

  // Type: Select (Dropdown)
  if (field.type === 'select' && field.options?.length) {
    return (
      <div className="space-y-2">
        <Label htmlFor={controlId} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {field.label} {field.required && <span className="text-primary">*</span>}
        </Label>
        <Select id={controlId} value={rawValue} onChange={e => onUpdate(e.target.value)} disabled={isDisabled} className="bg-muted/50">
          <option value="">-- SELECT --</option>
          {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </Select>
        {errorMessage && <p className="text-[10px] font-bold text-destructive uppercase tracking-tight">{errorMessage}</p>}
      </div>
    );
  }

  // Fallback: Standard Input
  const nativeTypes: Record<string, string> = {
    number: 'number', date: 'date', email: 'email', url: 'url', file: 'file',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={controlId} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {field.label} {field.required && <span className="text-primary">*</span>}
        </Label>
        <Badge variant="outline" className="text-[8px] font-mono opacity-50 uppercase">{field.type}</Badge>
      </div>
      <Input
        id={controlId}
        type={nativeTypes[field.type] ?? 'text'}
        value={rawValue}
        onChange={e => onUpdate(e.target.value)}
        disabled={isDisabled || field.type === 'computed'}
        placeholder={`ENTER ${field.label.toUpperCase()}`}
        className="bg-muted/50 border-border/50 focus:border-primary/50"
      />
      {errorMessage && <p className="text-[10px] font-bold text-destructive uppercase tracking-tight">{errorMessage}</p>}
    </div>
  );
}

// ── EXPORTED COMPONENT ─────────────────────────────────────────────────────────

/**
 * Main Data Portal Preview component.
 * Validates and maps UI inputs to a schema-compliant data object.
 */
export function DataPortalPreview({
  schema,
  initialValues = {},
  onValidate,
  actionLabel = 'Submit Data',
  isDisabled = false,
  className,
}: DataPortalPreviewProps) {
  const [formData, setFormData] = useState<PortalSubmissionData>(() =>
    Object.fromEntries(schema.map(f => [f.key, initialValues[f.key] ?? '']))
  );
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validator = generateValidationSchema(schema);

  const updateField = useCallback((key: string, val: unknown) => {
    setFormData(prev => ({ ...prev, [key]: val }));
    setValidationErrors(prev => { 
      const next = { ...prev }; 
      delete next[key]; 
      return next; 
    });
  }, []);

  const handleValidation = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validator.safeParse(formData);
    
    if (!result.success) {
      const errorMap: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        const path = String(issue.path[0]);
        if (!errorMap[path]) errorMap[path] = issue.message;
      });
      setValidationErrors(errorMap);
      onValidate?.(formData, errorMap);
    } else {
      setValidationErrors({});
      onValidate?.(result.data, {});
    }
  };

  return (
    <form onSubmit={handleValidation} className={cn('space-y-6', className)} noValidate>
      <div className="space-y-4">
        {schema.map(field => (
          <GenericFormControl
            key={field.key}
            field={field}
            value={formData[field.key]}
            errorMessage={validationErrors[field.key]}
            onUpdate={val => updateField(field.key, val)}
            isDisabled={isDisabled}
          />
        ))}
      </div>

      <Button type="submit" disabled={isDisabled} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-[10px] py-6 rounded-2xl shadow-lg shadow-primary/10">
        {actionLabel}
      </Button>
    </form>
  );
}
