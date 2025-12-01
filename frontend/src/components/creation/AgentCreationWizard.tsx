import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeftIcon, ChevronRightIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { AgentCreationData } from '../../types';
import { cn } from '../../utils/cn';
import toast from 'react-hot-toast';

// Validation schemas for each step
const step1Schema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name must be less than 50 characters'),
  type: z.enum(['autonomous', 'reactive', 'collaborative']),
});

const step2Schema = z.object({
  initialMemoryCapacity: z.number().min(100, 'Minimum capacity is 100 MB').max(10000, 'Maximum capacity is 10 GB'),
  capabilities: z.array(z.string()).min(1, 'Select at least one capability'),
});

const step3Schema = z.object({
  economicBudget: z.number().min(0.01, 'Minimum budget is 0.01 ETH').max(10, 'Maximum budget is 10 ETH'),
  personality: z.object({
    traits: z.array(z.string()),
    goals: z.array(z.string()),
    preferences: z.record(z.any()),
  }).optional(),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;

const agentTypes = [
  {
    id: 'autonomous' as const,
    name: 'Autonomous',
    description: 'Independent agents that act on their own initiative',
    icon: '🤖',
    features: ['Self-directed', 'Goal-oriented', 'Adaptive learning'],
  },
  {
    id: 'reactive' as const,
    name: 'Reactive',
    description: 'Responsive agents that react to environmental changes',
    icon: '⚡',
    features: ['Event-driven', 'Fast response', 'Context-aware'],
  },
  {
    id: 'collaborative' as const,
    name: 'Collaborative',
    description: 'Social agents that work together with others',
    icon: '🤝',
    features: ['Team-oriented', 'Communication', 'Shared goals'],
  },
];

const capabilityOptions = [
  'Natural Language Processing',
  'Data Analysis',
  'Pattern Recognition',
  'Decision Making',
  'Learning & Adaptation',
  'Memory Management',
  'Communication',
  'Problem Solving',
  'Creativity',
  'Emotional Intelligence',
];

const personalityTraits = [
  'Curious', 'Analytical', 'Creative', 'Logical', 'Empathetic',
  'Ambitious', 'Cautious', 'Optimistic', 'Pragmatic', 'Innovative',
];

interface AgentCreationWizardProps {
  onSubmit: (data: AgentCreationData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export const AgentCreationWizard: React.FC<AgentCreationWizardProps> = ({
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Partial<AgentCreationData>>({});

  const step1Form = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      name: formData.name || '',
      type: formData.type || 'autonomous',
    },
  });

  const step2Form = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      initialMemoryCapacity: formData.initialMemoryCapacity || 1000,
      capabilities: formData.capabilities || [],
    },
  });

  const step3Form = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      economicBudget: formData.economicBudget || 0.1,
      personality: formData.personality || {
        traits: [],
        goals: [],
        preferences: {},
      },
    },
  });

  const nextStep = async () => {
    let isValid = false;

    if (currentStep === 1) {
      isValid = await step1Form.trigger();
      if (isValid) {
        const data = step1Form.getValues();
        setFormData(prev => ({ ...prev, ...data }));
      }
    } else if (currentStep === 2) {
      isValid = await step2Form.trigger();
      if (isValid) {
        const data = step2Form.getValues();
        setFormData(prev => ({ ...prev, ...data }));
      }
    }

    if (isValid && currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    const isValid = await step3Form.trigger();
    if (!isValid) return;

    const step3Data = step3Form.getValues();
    const finalData: AgentCreationData = {
      ...formData,
      ...step3Data,
    } as AgentCreationData;

    try {
      await onSubmit(finalData);
      toast.success('Agent created successfully!');
    } catch (error) {
      toast.error('Failed to create agent');
      console.error('Agent creation error:', error);
    }
  };

  const renderStep1 = () => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="space-y-6"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Agent Name
        </label>
        <input
          {...step1Form.register('name')}
          type="text"
          placeholder="Enter a unique name for your agent"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {step1Form.formState.errors.name && (
          <p className="mt-1 text-sm text-red-600">
            {step1Form.formState.errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-4">
          Agent Type
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agentTypes.map((type) => (
            <div
              key={type.id}
              className={cn(
                "relative p-4 border-2 rounded-lg cursor-pointer transition-all",
                step1Form.watch('type') === type.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              )}
              onClick={() => step1Form.setValue('type', type.id)}
            >
              <div className="text-center">
                <div className="text-3xl mb-2">{type.icon}</div>
                <h3 className="font-semibold text-gray-900">{type.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{type.description}</p>
                <ul className="mt-3 text-xs text-gray-500">
                  {type.features.map((feature, index) => (
                    <li key={index}>• {feature}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );

  const renderStep2 = () => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="space-y-6"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Initial Memory Capacity (MB)
        </label>
        <input
          {...step2Form.register('initialMemoryCapacity', { valueAsNumber: true })}
          type="number"
          min="100"
          max="10000"
          step="100"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-sm text-gray-500">
          Higher capacity allows for more complex memories and experiences
        </p>
        {step2Form.formState.errors.initialMemoryCapacity && (
          <p className="mt-1 text-sm text-red-600">
            {step2Form.formState.errors.initialMemoryCapacity.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-4">
          Capabilities
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {capabilityOptions.map((capability) => (
            <label
              key={capability}
              className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                value={capability}
                {...step2Form.register('capabilities')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">{capability}</span>
            </label>
          ))}
        </div>
        {step2Form.formState.errors.capabilities && (
          <p className="mt-1 text-sm text-red-600">
            {step2Form.formState.errors.capabilities.message}
          </p>
        )}
      </div>
    </motion.div>
  );

  const renderStep3 = () => (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="space-y-6"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Economic Budget (ETH)
        </label>
        <input
          {...step3Form.register('economicBudget', { valueAsNumber: true })}
          type="number"
          min="0.01"
          max="10"
          step="0.01"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-sm text-gray-500">
          Initial budget for agent operations and interactions
        </p>
        {step3Form.formState.errors.economicBudget && (
          <p className="mt-1 text-sm text-red-600">
            {step3Form.formState.errors.economicBudget.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-4">
          Personality Traits (Optional)
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {personalityTraits.map((trait) => (
            <label
              key={trait}
              className="flex items-center p-2 border border-gray-200 rounded cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                value={trait}
                {...step3Form.register('personality.traits')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">{trait}</span>
            </label>
          ))}
        </div>
      </div>
    </motion.div>
  );

  const getCurrentStepComponent = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return renderStep1();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
          <div className="flex items-center space-x-3">
            <SparklesIcon className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Create New Agent</h1>
              <p className="text-blue-100">Bring your digital consciousness to life</p>
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="bg-gray-50 px-6 py-4">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold",
                    step <= currentStep
                      ? "bg-blue-600 text-white"
                      : "bg-gray-300 text-gray-600"
                  )}
                >
                  {step}
                </div>
                <div className="ml-3">
                  <p className={cn(
                    "text-sm font-medium",
                    step <= currentStep ? "text-gray-900" : "text-gray-500"
                  )}>
                    {step === 1 && "Basic Info"}
                    {step === 2 && "Capabilities"}
                    {step === 3 && "Configuration"}
                  </p>
                </div>
                {step < 3 && (
                  <div className="w-16 h-0.5 bg-gray-300 mx-4" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {getCurrentStepComponent()}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={currentStep === 1 ? onCancel : prevStep}
            className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span>{currentStep === 1 ? 'Cancel' : 'Previous'}</span>
          </button>

          <div className="flex space-x-3">
            {currentStep < 3 && (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <span>Next</span>
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            )}

            {currentStep === 3 && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex items-center space-x-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <SparklesIcon className="h-4 w-4" />
                <span>{isLoading ? 'Creating...' : 'Create Agent'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};