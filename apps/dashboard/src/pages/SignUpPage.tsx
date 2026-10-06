import React from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type FormValues = {
  firstName?: string;
  lastName?: string;
  organizationName?: string;
  email: string;
  password: string;
};

const SignUpPage: React.FC = () => {
  const { signup, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>();

  const onSubmit = async (values: FormValues) => {
    try {
      await signup(values);
      navigate('/workflows', { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Could not create account';
      setError('root', { type: 'custom', message });
    }
  };

  if (isAuthenticated) {
    navigate('/workflows', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold mb-4">CN</div>
          <h1 className="text-2xl font-semibold text-slate-900">Create account</h1>
          <p className="text-sm text-slate-500 mt-1">Start orchestrating notifications on campus</p>
        </div>
        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {errors.root && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 border border-rose-100">{errors.root.message}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="firstName">First name</label>
                <input id="firstName" className="input" placeholder="Ada" {...register('firstName')} />
              </div>
              <div>
                <label className="label" htmlFor="lastName">Last name</label>
                <input id="lastName" className="input" placeholder="Lovelace" {...register('lastName')} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="organizationName">Organization</label>
              <input id="organizationName" className="input" placeholder="My University" {...register('organizationName')} />
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input" placeholder="you@campus.edu" {...register('email', { required: 'Email is required' })} />
              {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" className="input" placeholder="••••••••" {...register('password', { required: 'Password is required', minLength: { value: 6, message: 'Password must be at least 6 characters' } })} />
              {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
            <p className="text-center text-sm text-slate-500">
              Already have an account? <Link to="/signin" className="text-indigo-600 hover:text-indigo-700 font-medium">Sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
