import React, { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import clsx from 'clsx';
import api from '../lib/api';
import type { Workflow, WorkflowStep } from './WorkflowsPage';

interface WorkflowEditorPageProps {
  initial: Workflow | null;
  onClose: () => void;
}

type StepInput = {
  type: WorkflowStep['type'];
  subject?: string;
  body?: string;
};

type FormValues = {
  name: string;
  description?: string;
  active: boolean;
  steps: StepInput[];
};

const WorkflowEditorPage: React.FC<WorkflowEditorPageProps> = ({ initial, onClose }) => {
  const isEdit = Boolean(initial);
  const defaultValues: FormValues = {
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    active: initial?.active ?? false,
    steps: (initial?.steps ?? []).map((s) => ({ type: s.type, subject: s.subject, body: s.body })),
  };
  if (defaultValues.steps.length === 0) {
    defaultValues.steps = [{ type: 'in_app' }];
  }

  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'steps',
  });

  const [serverError, setServerError] = React.useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const payload = {
        name: values.name,
        description: values.description,
        active: values.active,
        steps: values.steps.map((s) => ({ type: s.type, subject: s.subject, body: s.body })),
      };
      if (isEdit && initial) {
        await api.patch(`/v2/workflows/${initial.id}`, payload);
      } else {
        await api.post('/v2/workflows', payload);
      }
      onClose();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to save workflow';
      setServerError(message);
      setError('root', { type: 'custom', message });
    }
  };

  const watchActive = watch('active');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl border border-slate-200 bg-white flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{isEdit ? 'Edit workflow' : 'Create workflow'}</h2>
            <p className="text-sm text-slate-500 mt-0.5">Configure steps and activation.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col min-h-0">
          <div className="overflow-auto px-6 py-5 space-y-5">
            {serverError && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 border border-rose-100">{serverError}</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="label" htmlFor="name">Name</label>
                <input id="name" className="input" placeholder="Course reminder" {...register('name', { required: 'Name is required' })} />
                {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>}
              </div>
              <div>
                <div className="flex items-end justify-between h-[38px]">
                  <label className="label mb-0" htmlFor="active">Activate</label>
                  <label className="inline-flex items-center cursor-pointer">
                    <input id="active" type="checkbox" className="sr-only peer" {...register('active')} />
                    <div className={clsx('relative w-10 h-6 rounded-full transition-colors', watchActive ? 'bg-indigo-600' : 'bg-slate-300')}>
                      <div className={clsx('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', watchActive ? 'translate-x-4' : 'translate-x-0.5')} />
                    </div>
                  </label>
                </div>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="description">Description</label>
              <textarea id="description" rows={2} className="input resize-none" placeholder="What does this workflow do?" {...register('description')} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900">Steps</h3>
                <button
                  type="button"
                  className="btn-secondary !px-3 !py-1.5 text-xs"
                  onClick={() => append({ type: 'in_app' })}
                >
                  + Add step
                </button>
              </div>
              <div className="space-y-3">
                {fields.map((field, idx) => (
                  <div key={field.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-slate-500 uppercase">Step {idx + 1}</div>
                      <div className="flex items-center gap-2">
                        <select
                          className="input !w-auto !py-1.5 text-sm"
                          {...register(`steps.${idx}.type` as const, { required: true })}
                        >
                          <option value="in_app">In-app</option>
                          <option value="email">Email</option>
                        </select>
                        {fields.length > 1 && (
                          <button type="button" className="btn-ghost !px-2 !py-1 text-xs text-rose-600" onClick={() => remove(idx)}>Remove</button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="label" htmlFor={`steps.${idx}.subject`}>Subject</label>
                      <input
                        id={`steps.${idx}.subject`}
                        className="input"
                        placeholder="Notification subject"
                        {...register(`steps.${idx}.subject` as const)}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`steps.${idx}.body`}>Body</label>
                      <textarea
                        id={`steps.${idx}.body`}
                        rows={4}
                        className="input resize-y"
                        placeholder="Message body…"
                        {...register(`steps.${idx}.body` as const)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving…' : 'Save workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WorkflowEditorPage;
