'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Brain, Coins, Shield, Zap } from 'lucide-react';
import { useWeb3 } from '@/hooks/use-web3';
import { toast } from 'sonner';

interface AgentCreationWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

interface AgentConfig {
  // Step 1: Basic Info
  name: string;
  description: string;
  agentType: string;

  // Step 2: AI Configuration
  aiProvider: string;
  model: string;
  temperature: number;
  personality: {
    traits: string[];
    goals: string[];
    constraints: string[];
  };

  // Step 3: Economic & Deployment
  initialFunding: string;
  economicModel: string;
  autonomyLevel: number;
  memorySize: string;
  enableCrossChain: boolean;
}

const AGENT_TYPES = [
  { value: 'researcher', label: 'Researcher', icon: '🔍', description: 'Specialized in data analysis and research' },
  { value: 'trader', label: 'Trader', icon: '💰', description: 'Autonomous trading and portfolio management' },
  { value: 'creator', label: 'Creator', icon: '🎨', description: 'Content creation and creative tasks' },
  { value: 'assistant', label: 'Assistant', icon: '🤖', description: 'General purpose assistance and automation' },
  { value: 'validator', label: 'Validator', icon: '✅', description: 'Data validation and verification' },
];

const AI_PROVIDERS = [
  { value: 'claude', label: 'Claude 3.5 Sonnet', description: 'Advanced reasoning and coding' },
  { value: 'gpt4', label: 'GPT-4 Turbo', description: 'Multimodal capabilities' },
  { value: 'hybrid', label: 'Hybrid AI', description: 'Best of both models' },
];

const PERSONALITY_TRAITS = [
  'analytical', 'creative', 'logical', 'empathetic', 'assertive', 'cautious',
  'optimistic', 'detail-oriented', 'innovative', 'collaborative'
];

export function AgentCreationWizard({ onClose, onComplete }: AgentCreationWizardProps) {
  const { account, isConnected } = useWeb3();
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  const [config, setConfig] = useState<AgentConfig>({
    name: '',
    description: '',
    agentType: '',
    aiProvider: '',
    model: '',
    temperature: 0.7,
    personality: {
      traits: [],
      goals: [],
      constraints: []
    },
    initialFunding: '0.1',
    economicModel: 'basic',
    autonomyLevel: 50,
    memorySize: '1GB',
    enableCrossChain: false
  });

  const progress = (currentStep / 3) * 100;

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleTraitToggle = (trait: string) => {
    const traits = config.personality.traits;
    const newTraits = traits.includes(trait)
      ? traits.filter(t => t !== trait)
      : [...traits, trait];

    setConfig({
      ...config,
      personality: { ...config.personality, traits: newTraits }
    });
  };

  const handleCreateAgent = async () => {
    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsCreating(true);
    try {
      // Simulate agent creation - replace with actual contract calls
      await new Promise(resolve => setTimeout(resolve, 3000));

      toast.success('Immortal Agent created successfully!');
      onComplete();
    } catch (error) {
      toast.error('Failed to create agent');
      console.error('Agent creation error:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return config.name && config.description && config.agentType;
      case 2:
        return config.aiProvider && config.personality.traits.length > 0;
      case 3:
        return config.initialFunding && config.economicModel;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-2">Create Immortal Agent</h1>
            <p className="text-slate-400">Step {currentStep} of 3</p>
          </div>

          <div className="w-20" />
        </div>

        {/* Progress */}
        <div className="mb-8">
          <Progress value={progress} className="h-2 bg-slate-800" />
        </div>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-xl">
              {currentStep === 1 && 'Basic Configuration'}
              {currentStep === 2 && 'AI Intelligence Setup'}
              {currentStep === 3 && 'Economic & Deployment'}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {currentStep === 1 && 'Define your agent\'s identity and purpose'}
              {currentStep === 2 && 'Configure AI capabilities and personality'}
              {currentStep === 3 && 'Set up economics and launch parameters'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Step 1: Basic Configuration */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-white">Agent Name</Label>
                  <Input
                    id="name"
                    value={config.name}
                    onChange={(e) => setConfig({ ...config, name: e.target.value })}
                    placeholder="Enter agent name..."
                    className="bg-slate-900 border-slate-600 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-white">Description</Label>
                  <Textarea
                    id="description"
                    value={config.description}
                    onChange={(e) => setConfig({ ...config, description: e.target.value })}
                    placeholder="Describe your agent's purpose and capabilities..."
                    rows={3}
                    className="bg-slate-900 border-slate-600 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Agent Type</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {AGENT_TYPES.map((type) => (
                      <Card
                        key={type.value}
                        className={`cursor-pointer transition-all ${
                          config.agentType === type.value
                            ? 'border-purple-500 bg-purple-900/20'
                            : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                        }`}
                        onClick={() => setConfig({ ...config, agentType: type.value })}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{type.icon}</span>
                            <div>
                              <h3 className="text-white font-medium">{type.label}</h3>
                              <p className="text-slate-400 text-sm">{type.description}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: AI Configuration */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-white">AI Provider</Label>
                  <div className="grid gap-3">
                    {AI_PROVIDERS.map((provider) => (
                      <Card
                        key={provider.value}
                        className={`cursor-pointer transition-all ${
                          config.aiProvider === provider.value
                            ? 'border-blue-500 bg-blue-900/20'
                            : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                        }`}
                        onClick={() => setConfig({ ...config, aiProvider: provider.value })}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-white font-medium">{provider.label}</h3>
                              <p className="text-slate-400 text-sm">{provider.description}</p>
                            </div>
                            <Brain className="w-6 h-6 text-blue-400" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Personality Traits</Label>
                  <p className="text-slate-400 text-sm mb-3">Select traits that define your agent's personality</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {PERSONALITY_TRAITS.map((trait) => (
                      <div
                        key={trait}
                        className="flex items-center space-x-2 cursor-pointer"
                        onClick={() => handleTraitToggle(trait)}
                      >
                        <Checkbox
                          checked={config.personality.traits.includes(trait)}
                          onCheckedChange={() => handleTraitToggle(trait)}
                          className="border-slate-500"
                        />
                        <label className="text-slate-300 text-sm capitalize cursor-pointer">
                          {trait}
                        </label>
                      </div>
                    ))}
                  </div>
                  {config.personality.traits.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {config.personality.traits.map((trait) => (
                        <Badge key={trait} variant="secondary" className="bg-purple-900/50 text-purple-300">
                          {trait}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature" className="text-white">
                    Creativity Level: {config.temperature}
                  </Label>
                  <input
                    type="range"
                    id="temperature"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Conservative</span>
                    <span>Balanced</span>
                    <span>Creative</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Economic & Deployment */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="funding" className="text-white">Initial Funding (BNB)</Label>
                    <Input
                      id="funding"
                      type="number"
                      value={config.initialFunding}
                      onChange={(e) => setConfig({ ...config, initialFunding: e.target.value })}
                      placeholder="0.1"
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="memory" className="text-white">Memory Size</Label>
                    <Select
                      value={config.memorySize}
                      onValueChange={(value) => setConfig({ ...config, memorySize: value })}
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                        <SelectValue placeholder="Select memory size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="512MB">512MB</SelectItem>
                        <SelectItem value="1GB">1GB</SelectItem>
                        <SelectItem value="2GB">2GB</SelectItem>
                        <SelectItem value="5GB">5GB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Economic Model</Label>
                  <div className="grid gap-3">
                    <Card
                      className={`cursor-pointer transition-all ${
                        config.economicModel === 'basic'
                          ? 'border-green-500 bg-green-900/20'
                          : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                      }`}
                      onClick={() => setConfig({ ...config, economicModel: 'basic' })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-white font-medium">Basic Economy</h3>
                            <p className="text-slate-400 text-sm">Fixed fees, simple bonding curve</p>
                          </div>
                          <Coins className="w-6 h-6 text-green-400" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card
                      className={`cursor-pointer transition-all ${
                        config.economicModel === 'advanced'
                          ? 'border-yellow-500 bg-yellow-900/20'
                          : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                      }`}
                      onClick={() => setConfig({ ...config, economicModel: 'advanced' })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-white font-medium">Advanced Economy</h3>
                            <p className="text-slate-400 text-sm">Dynamic pricing, yield generation</p>
                          </div>
                          <Zap className="w-6 h-6 text-yellow-400" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Autonomy Level: {config.autonomyLevel}%</Label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.autonomyLevel}
                    onChange={(e) => setConfig({ ...config, autonomyLevel: parseInt(e.target.value) })}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Manual Control</span>
                    <span>Semi-Autonomous</span>
                    <span>Full Autonomy</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="crosschain"
                    checked={config.enableCrossChain}
                    onCheckedChange={(checked) => setConfig({ ...config, enableCrossChain: checked as boolean })}
                    className="border-slate-500"
                  />
                  <Label htmlFor="crosschain" className="text-slate-300">
                    Enable cross-chain capabilities
                  </Label>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-6 border-t border-slate-700">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 1}
                className="border-slate-600 text-slate-300 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>

              {currentStep < 3 ? (
                <Button
                  onClick={handleNext}
                  disabled={!isStepValid()}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleCreateAgent}
                  disabled={!isStepValid() || isCreating}
                  className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Creating Agent...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 mr-2" />
                      Create Immortal Agent
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}