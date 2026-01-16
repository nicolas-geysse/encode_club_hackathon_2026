/**
 * Onboarding Chat Component
 *
 * Conversational onboarding with Bruno avatar.
 * Progressive questions to build student profile.
 */

import { createSignal, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ProfileData {
  name: string;
  diploma: string;
  field: string;
  yearsRemaining: number;
  skills: string[];
  city: string;
  incomes: { source: string; amount: number }[];
  expenses: { category: string; amount: number }[];
  maxWorkHours: number;
  minHourlyRate: number;
  hasLoan: boolean;
  loanAmount: number;
}

type OnboardingStep =
  | 'greeting'
  | 'name'
  | 'studies'
  | 'skills'
  | 'location'
  | 'budget'
  | 'work_preferences'
  | 'complete';

const QUESTIONS: Record<OnboardingStep, string> = {
  greeting: `Salut ! Je suis **Bruno**, ton coach financier personnel.

Je vais t'aider a naviguer ta vie etudiante et atteindre tes objectifs.

Pour commencer, **comment tu t'appelles ?**`,
  name: '', // Dynamic based on user input
  studies: `Et niveau etudes, **t'es en quoi** ?
(Ex: "L2 Info", "M1 Droit", "BTS Commerce")`,
  skills: `Top ! Maintenant, parle-moi de **tes competences**.
Qu'est-ce que tu sais faire ? (Code, langues, design, sport...)

Tu peux me donner plusieurs trucs, separes par des virgules.`,
  location: `Tu vis ou ? **Quelle ville ?**
(Ca m'aide a trouver des opportunites locales)`,
  budget: `Maintenant, parlons **budget**.

Dis-moi grosso modo :
- Combien tu touches par mois (APL, parents, bourse, job...)
- Combien tu depenses (loyer, bouffe, transport...)

Exemple: "J'ai 800 euros avec APL et aide des parents, et je depense 600"`,
  work_preferences: `Derniere question ! Pour les jobs :
- **Combien d'heures max** par semaine tu peux bosser ?
- **Quel taux horaire minimum** tu acceptes ?

Exemple: "15h max, minimum 12 euros"`,
  complete: `Parfait ! J'ai tout ce qu'il me faut.

Je t'ai cree un profil personnalise. Tu peux maintenant :
- Definir un objectif d'epargne
- Explorer les jobs qui matchent tes competences
- Optimiser ton budget

**On y va ?** Clique sur "Mon Plan" pour commencer !`,
};

export function OnboardingChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [step, setStep] = createSignal<OnboardingStep>('greeting');
  const [profile, setProfile] = createSignal<Partial<ProfileData>>({
    skills: [],
    incomes: [],
    expenses: [],
    maxWorkHours: 15,
    minHourlyRate: 12,
    hasLoan: false,
    loanAmount: 0,
  });
  const [isComplete, setIsComplete] = createSignal(false);

  // Check for existing profile on mount
  onMount(() => {
    const stored = localStorage.getItem('studentProfile');
    if (stored) {
      const existingProfile = JSON.parse(stored);
      setProfile(existingProfile);
      // If profile exists, show welcome back message
      setMessages([
        {
          id: 'welcome-back',
          role: 'assistant',
          content: `Re-salut **${existingProfile.name}** ! Content de te revoir.

Tu veux mettre a jour ton profil ou passer directement a ton plan ?`,
        },
      ]);
      setIsComplete(true);
    } else {
      // Start onboarding
      setMessages([
        {
          id: 'greeting',
          role: 'assistant',
          content: QUESTIONS.greeting,
        },
      ]);
      setStep('name');
    }
  });

  // Parse user response based on current step
  const parseResponse = (text: string, currentStep: OnboardingStep) => {
    const lower = text.toLowerCase();

    switch (currentStep) {
      case 'name':
        setProfile({ ...profile(), name: text.trim() });
        return true;

      case 'studies': {
        // Try to parse diploma and field
        const diplomaMatch = lower.match(/\b(l[1-3]|m[1-2]|bts|dut|licence|master)\b/i);
        const diploma = diplomaMatch ? diplomaMatch[1].toUpperCase() : 'L2';

        let field = 'Autre';
        if (lower.includes('info') || lower.includes('dev')) field = 'Informatique';
        else if (lower.includes('droit') || lower.includes('juri')) field = 'Droit';
        else if (
          lower.includes('commerce') ||
          lower.includes('business') ||
          lower.includes('gestion')
        )
          field = 'Commerce';
        else if (lower.includes('langue') || lower.includes('llea') || lower.includes('anglais'))
          field = 'Langues';
        else if (lower.includes('psycho')) field = 'Psychologie';
        else if (lower.includes('medecine') || lower.includes('sante') || lower.includes('pharma'))
          field = 'Sante';
        else if (lower.includes('art') || lower.includes('design')) field = 'Arts';
        else if (lower.includes('science') || lower.includes('maths') || lower.includes('physique'))
          field = 'Sciences';

        const yearsMatch = text.match(/(\d+)\s*(ans?|annees?)/i);
        const yearsRemaining = yearsMatch
          ? parseInt(yearsMatch[1])
          : diploma.startsWith('M')
            ? 1
            : 3;

        setProfile({ ...profile(), diploma, field, yearsRemaining });
        return true;
      }

      case 'skills': {
        const skillKeywords: Record<string, string> = {
          python: 'python',
          javascript: 'javascript',
          js: 'javascript',
          react: 'javascript',
          sql: 'sql',
          excel: 'excel',
          anglais: 'anglais',
          english: 'anglais',
          espagnol: 'espagnol',
          allemand: 'allemand',
          design: 'design',
          graphisme: 'design',
          photoshop: 'design',
          figma: 'design',
          redaction: 'redaction',
          ecriture: 'redaction',
          compta: 'comptabilite',
          comptabilite: 'comptabilite',
          social: 'social_media',
          instagram: 'social_media',
          tiktok: 'social_media',
          sport: 'sport',
          coaching: 'coaching',
        };

        const detectedSkills: string[] = [];
        for (const [keyword, skill] of Object.entries(skillKeywords)) {
          if (lower.includes(keyword) && !detectedSkills.includes(skill)) {
            detectedSkills.push(skill);
          }
        }

        if (detectedSkills.length === 0) {
          // Default skills based on field
          const p = profile();
          if (p.field === 'Informatique') detectedSkills.push('python', 'sql');
          else if (p.field === 'Commerce') detectedSkills.push('excel', 'anglais');
          else if (p.field === 'Langues') detectedSkills.push('anglais', 'redaction');
          else detectedSkills.push('excel');
        }

        setProfile({ ...profile(), skills: detectedSkills });
        return true;
      }

      case 'location': {
        const city = text.trim();
        let citySize = 'medium';
        const bigCities = [
          'paris',
          'lyon',
          'marseille',
          'toulouse',
          'bordeaux',
          'lille',
          'nantes',
          'nice',
        ];
        const smallCities = ['village', 'campagne', 'rural'];

        if (bigCities.some((c) => lower.includes(c))) citySize = 'large';
        else if (smallCities.some((c) => lower.includes(c))) citySize = 'small';

        setProfile({ ...profile(), city, citySize });
        return true;
      }

      case 'budget': {
        // Parse income
        const incomeMatch = lower.match(/(\d+)\s*(euros?)?\s*(par mois|\/mois|mensuel)?/);
        const income = incomeMatch ? parseInt(incomeMatch[1]) : 800;

        // Parse expenses
        const expenseMatch = lower.match(
          /depense[s]?\s*(\d+)|(\d+)\s*(euros?)?\s*(de depenses?|depense)/
        );
        const expenses = expenseMatch
          ? parseInt(expenseMatch[1] || expenseMatch[2])
          : income * 0.75;

        // Estimate breakdown
        const incomes = [{ source: 'total', amount: income }];
        const expensesList = [
          { category: 'loyer', amount: Math.round(expenses * 0.5) },
          { category: 'alimentation', amount: Math.round(expenses * 0.25) },
          { category: 'transport', amount: Math.round(expenses * 0.1) },
          { category: 'autre', amount: Math.round(expenses * 0.15) },
        ];

        setProfile({ ...profile(), incomes, expenses: expensesList });
        return true;
      }

      case 'work_preferences': {
        const hoursMatch = lower.match(/(\d+)\s*h(eures?)?(\s*(max|\/sem|par sem))?/);
        const maxWorkHours = hoursMatch ? parseInt(hoursMatch[1]) : 15;

        const rateMatch = lower.match(/(\d+)\s*(euros?|€)?(\/h|par h|heure|minimum)?/);
        const minHourlyRate = rateMatch ? parseInt(rateMatch[1]) : 12;

        setProfile({ ...profile(), maxWorkHours, minHourlyRate });
        return true;
      }

      default:
        return true;
    }
  };

  const getNextStep = (currentStep: OnboardingStep): OnboardingStep => {
    const flow: OnboardingStep[] = [
      'greeting',
      'name',
      'studies',
      'skills',
      'location',
      'budget',
      'work_preferences',
      'complete',
    ];
    const currentIndex = flow.indexOf(currentStep);
    return flow[currentIndex + 1] || 'complete';
  };

  const handleSend = async (text: string) => {
    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages([...messages(), userMsg]);
    setLoading(true);

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Parse response
    const currentStep = step();
    parseResponse(text, currentStep);

    // Move to next step
    const nextStep = getNextStep(currentStep);
    setStep(nextStep);

    // Generate response
    let response = QUESTIONS[nextStep];

    if (nextStep === 'studies') {
      const p = profile();
      response = `Super ${p.name} ! Enchanté.

${QUESTIONS.studies}`;
    } else if (nextStep === 'skills') {
      const p = profile();
      response = `${p.diploma} ${p.field}, nice ! ${p.yearsRemaining} ans, ca te laisse le temps.

${QUESTIONS.skills}`;
    } else if (nextStep === 'location') {
      const p = profile();
      const skillNames = p.skills?.map((s) => {
        const labels: Record<string, string> = {
          python: 'Python',
          javascript: 'JavaScript',
          sql: 'SQL',
          excel: 'Excel',
          anglais: 'Anglais',
          design: 'Design',
          redaction: 'Redaction',
          social_media: 'Reseaux sociaux',
        };
        return labels[s] || s;
      });
      response = `${skillNames?.join(', ')} - pas mal du tout !

${QUESTIONS.location}`;
    } else if (nextStep === 'budget') {
      const p = profile();
      response = `${p.city}, je note.

${QUESTIONS.budget}`;
    } else if (nextStep === 'work_preferences') {
      const p = profile();
      const totalIncome = p.incomes?.reduce((sum, i) => sum + i.amount, 0) || 0;
      const totalExpenses = p.expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
      const margin = totalIncome - totalExpenses;

      let budgetComment = '';
      if (margin > 100) budgetComment = "T'as une marge confortable !";
      else if (margin > 0) budgetComment = 'Budget serre mais ca passe.';
      else budgetComment = 'Budget tendu, on va trouver des solutions.';

      response = `${budgetComment}

${QUESTIONS.work_preferences}`;
    } else if (nextStep === 'complete') {
      // Save profile to localStorage
      const finalProfile = profile() as ProfileData;
      localStorage.setItem('studentProfile', JSON.stringify(finalProfile));
      setIsComplete(true);
    }

    // Add assistant message
    const assistantMsg: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: response,
    };
    setMessages([...messages(), assistantMsg]);
    setLoading(false);
  };

  const goToPlan = () => {
    navigate('/plan');
  };

  return (
    <div class="flex flex-col h-[calc(100vh-180px)] max-w-3xl mx-auto">
      {/* Chat messages */}
      <div class="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        <For each={messages()}>
          {(msg) => (
            <ChatMessage
              role={msg.role}
              content={msg.content}
              avatar="B"
              name={msg.role === 'assistant' ? 'Bruno' : undefined}
            />
          )}
        </For>

        <Show when={loading()}>
          <div class="flex justify-start mb-4">
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-lg shadow-sm">
                B
              </div>
              <div class="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                  <div
                    class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                    style={{ 'animation-delay': '0.1s' }}
                  />
                  <div
                    class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                    style={{ 'animation-delay': '0.2s' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* Input or action buttons */}
      <Show
        when={!isComplete()}
        fallback={
          <div class="border-t border-slate-200 bg-white p-6 text-center">
            <button class="btn-primary text-lg px-8 py-3" onClick={goToPlan}>
              Commencer Mon Plan
            </button>
            <p class="text-sm text-slate-500 mt-3">
              Ou{' '}
              <button
                class="text-primary-600 underline"
                onClick={() => {
                  setIsComplete(false);
                  setStep('name');
                  setMessages([{ id: 'restart', role: 'assistant', content: QUESTIONS.greeting }]);
                }}
              >
                recommence l'onboarding
              </button>
            </p>
          </div>
        }
      >
        <ChatInput onSend={handleSend} placeholder="Ecris ta reponse..." disabled={loading()} />
      </Show>
    </div>
  );
}
