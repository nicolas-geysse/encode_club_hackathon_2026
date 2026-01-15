import { createSignal, For, onMount, Show } from "solid-js";
import { VoiceInput } from "~/components/VoiceInput";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function Chat() {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [input, setInput] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [profileName, setProfileName] = createSignal("");

  onMount(() => {
    // Get profile name from sessionStorage
    const stored = sessionStorage.getItem("studentProfile");
    if (stored) {
      const profile = JSON.parse(stored);
      setProfileName(profile.name || "");
    }

    // Add welcome message
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Salut${profileName() ? ` ${profileName()}` : ""} ! Je suis ton assistant financier. Tu peux me poser des questions sur ton budget, tes jobs potentiels, ou demander des simulations. Par exemple :

- "Et si je travaillais 20h au lieu de 10h ?"
- "Je ne veux pas faire de coloc"
- "Explique-moi pourquoi freelance plutôt que McDo ?"
- "Comment économiser sur l'alimentation ?"`,
        timestamp: new Date(),
      },
    ]);
  });

  const sendMessage = async () => {
    const userMessage = input().trim();
    if (!userMessage) return;

    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages([...messages(), userMsg]);
    setInput("");
    setLoading(true);

    // Simulate AI response (in real app, this would call the MCP server)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Generate response based on keywords
    let response = "";
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes("20h") || lowerMessage.includes("heures")) {
      response = `Si tu passes à 20h/semaine :

📊 **Nouvelle projection :**
- Revenu job : +2000€/mois (20h × 25€/h × 4 sem)
- Nouvelle marge : +1450€/mois
- Balance fin études : +52 200€

⚠️ **Points d'attention :**
- Impact potentiel sur tes études (-0.5 à -1 point de moyenne estimé)
- Risque de fatigue plus élevé

💡 **Recommandation :** Commence par 15h et ajuste selon ton ressenti.`;
    } else if (lowerMessage.includes("coloc") || lowerMessage.includes("colocation")) {
      response = `Je comprends que la coloc n'est pas pour tout le monde.

📊 **Impact sur ton budget :**
- Sans coloc : -150€ d'économie potentielle/mois
- Tu devras compenser par environ 6h de travail en plus/mois

🏠 **Alternatives au loyer :**
- Logement CROUS (liste d'attente mais -30% en moyenne)
- Aide au logement réévaluée si changement de situation
- Sous-location temporaire pendant les vacances

💡 **Astuce :** Regarde les résidences étudiantes conventionnées, souvent moins chères qu'un appart classique.`;
    } else if (lowerMessage.includes("freelance") || lowerMessage.includes("mcdo") || lowerMessage.includes("pourquoi")) {
      response = `Voici pourquoi je te recommande le freelance :

🎯 **Freelance Dev** vs **Fast-food** :

| Critère | Freelance | Fast-food |
|---------|-----------|-----------|
| Taux horaire | 25€/h | 11€/h |
| Flexibilité | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Co-bénéfice | CV++, réseau, XP | Aucun |
| Revenus 10h/sem | 1000€ | 440€ |

📈 **Chemin dans le graph :**
\`Python → Dev → Freelance → 25€/h + expérience valorisable\`

💡 **Le vrai plus :** En freelance, tu développes des compétences que tu utilises en cours ET tu crées un portfolio pour ton premier emploi.`;
    } else if (lowerMessage.includes("alimentation") || lowerMessage.includes("manger") || lowerMessage.includes("bouffe")) {
      response = `Voici comment optimiser ton budget alimentation :

🍽️ **Options économiques :**
1. **Resto U CROUS** : 3,30€ le repas complet → 50% d'économie
2. **Batch cooking** : Cuisine le dimanche pour la semaine → 30% d'économie
3. **Too Good To Go** : Paniers anti-gaspi à -70%
4. **Carte jeune/étudiant** : Réductions dans certains supermarchés

📊 **Impact sur ton budget :**
- Budget actuel estimé : 200€/mois
- Avec CROUS + batch cooking : ~100€/mois
- Économie : 100€/mois soit 1200€/an

💡 **Astuce :** Le CROUS est souvent à côté des campus, pas d'excuse !`;
    } else {
      response = `Bonne question ! Laisse-moi analyser ça...

D'après ton profil, voici ce que je peux te dire :

📊 **Situation actuelle :**
- Tu es sur la bonne voie avec une marge positive
- Tes compétences te permettent d'accéder à des jobs bien payés

💡 **Pour aller plus loin :**
- Pose-moi des questions spécifiques sur ton budget
- Demande des simulations ("Et si...")
- Explore les jobs qui matchent avec ta filière

Tu veux que je détaille un aspect en particulier ?`;
    }

    const assistantMsg: Message = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: response,
      timestamp: new Date(),
    };
    setMessages([...messages(), assistantMsg]);
    setLoading(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div class="flex flex-col h-[calc(100vh-200px)]">
      {/* Messages */}
      <div class="flex-1 overflow-y-auto space-y-4 pb-4">
        <For each={messages()}>
          {(msg) => (
            <div
              class={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                class={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary-600 text-white"
                    : "bg-white border border-slate-200 shadow-sm"
                }`}
              >
                <div
                  class={`whitespace-pre-wrap ${
                    msg.role === "assistant" ? "prose prose-sm max-w-none" : ""
                  }`}
                  innerHTML={
                    msg.role === "assistant"
                      ? msg.content
                          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                          .replace(/`([^`]+)`/g, "<code class='bg-slate-100 px-1 rounded'>$1</code>")
                          .replace(/\n/g, "<br>")
                      : msg.content
                  }
                />
              </div>
            </div>
          )}
        </For>

        <Show when={loading()}>
          <div class="flex justify-start">
            <div class="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* Input */}
      <div class="border-t border-slate-200 pt-4 mt-4">
        <div class="flex gap-3 items-end">
          <textarea
            class="input-field flex-1 resize-none"
            rows="2"
            placeholder="Pose ta question ici..."
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={loading()}
          />
          <VoiceInput
            onTranscript={(text) => setInput(input() + (input() ? ' ' : '') + text)}
            disabled={loading()}
          />
          <button
            class="btn-primary"
            onClick={sendMessage}
            disabled={loading() || !input().trim()}
          >
            Envoyer
          </button>
        </div>
        <p class="text-xs text-slate-500 mt-2">
          Appuie sur Entree pour envoyer • Shift+Entree pour nouvelle ligne • Micro pour dicter
        </p>
      </div>
    </div>
  );
}
