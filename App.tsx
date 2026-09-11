import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { aniStaticDetails, defaultDamienDetails, getSystemInstruction, getAiServiceConfig, ResolvedAiServiceConfig } from './constants/aniPersona';
import { generateChatResponse, generateImageEditResponse } from './components/services/apiService';
import { Message, TokenUsage, DamienDetails, AiProvider, SearchResult } from './types';
import ChatView from './components/ChatView';
import ImageEditView from './components/ImageEditView';
import ParametersView from './components/ParametersView';
import AniAvatar from './components/AniAvatar';
import LoadingSpinner from './components/LoadingSpinner';
import SaveConfirmation from './components/SaveConfirmation';
import AutoSaveConfirmation from './components/AutoSaveConfirmation';
import ChatSearchModal from './components/ChatSearchModal';
import { ALL_TOOL_DECLARATIONS } from './tools/declarations'; // Import tool declarations

type ChatHistories = {
  [key in AiProvider]: Message[];
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'chat' | 'imageEdit' | 'parameters'>('chat');
  const [chatHistories, setChatHistories] = useState<ChatHistories>(() => {
    const savedGeminiChat = localStorage.getItem('aniChatHistory_gemini');
    const savedMistralChat = localStorage.getItem('aniChatHistory_mistral');
    return {
      [AiProvider.GEMINI]: savedGeminiChat ? JSON.parse(savedGeminiChat) : [],
      [AiProvider.MISTRAL]: savedMistralChat ? JSON.parse(savedMistralChat) : [],
    };
  });
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [selectedApiKey, setSelectedApiKey] = useState<boolean>(false);
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  const [editedImageGallery, setEditedImageGallery] = useState<string[]>([]);
  const [aniMode, setAniMode] = useState<'Base Ani' | 'Eve' | 'Ara'>('Base Ani');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [selectedAiProvider, setSelectedAiProvider] = useState<AiProvider>(AiProvider.GEMINI); // Default to Gemini
  const [imageEditTokenUsage, setImageEditTokenUsage] = useState<TokenUsage | null>(null);
  const [damienPersona, setDamienPersona] = useState<DamienDetails>(() => {
    const savedDamien = localStorage.getItem('damienPersona');
    return savedDamien ? JSON.parse(savedDamien) : defaultDamienDetails;
  });
  const [geminiRetryUntil, setGeminiRetryUntil] = useState<number>(0);
  const [remainingGeminiRetryTime, setRemainingGeminiRetryTime] = useState(0);
  const [mistralRetryUntil, setMistralRetryUntil] = useState<number>(0);
  const [remainingMistralRetryTime, setRemainingMistralRetryTime] = useState(0);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState<boolean>(false);
  const [showAutoSaveConfirmation, setShowAutoSaveConfirmation] = useState<boolean>(false);
  const [geminiTotalTokensUsed, setGeminiTotalTokensUsed] = useState<number>(() => {
    const saved = localStorage.getItem('geminiTotalTokensUsed');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [mistralTotalTokensUsed, setMistralTotalTokensUsed] = useState<number>(() => {
    const saved = localStorage.getItem('mistralTotalTokensUsed');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const [isSpeechSynthesisReady, setIsSpeechSynthesisReady] = useState(false);
  const [aniVoice, setAniVoice] = useState<SpeechSynthesisVoice | null>(null);

  const [isSearchingWeb, setIsSearchingWeb] = useState<boolean>(false);
  // New state for chatbot visibility
  const [isChatbotOpen, setIsChatbotOpen] = useState<boolean>(true);


  const resolvedAiServiceConfig: ResolvedAiServiceConfig = useMemo(() => getAiServiceConfig(damienPersona), [damienPersona]);

  const speechSynth = window.speechSynthesis;
  const aniVoiceName = 'Google français';

  const getAniVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = speechSynth.getVoices();
    const foundVoice = voices.find(voice => voice.lang === 'fr-FR' && voice.name.includes('Google') && voice.name.includes('Female')) ||
                       voices.find(voice => voice.lang.startsWith('fr') && voice.name.includes(aniVoiceName)) ||
                       voices.find(voice => voice.lang.startsWith('fr')) ||
                       null;
    return foundVoice;
  }, [speechSynth]);

  useEffect(() => {
    const handleVoicesChanged = () => {
      const currentAniVoice = getAniVoice();
      setAniVoice(currentAniVoice);
      setIsSpeechSynthesisReady(true);
      if (!currentAniVoice) {
        console.warn("Ani, bordel ! Aucune voix française n'a été trouvée pour la synthèse vocale. Je vais devoir m'exprimer par écrit, connard !");
      }
    };

    if (speechSynth) {
      if (speechSynth.getVoices().length > 0) {
        handleVoicesChanged(); // Voices might already be loaded
      } else {
        speechSynth.addEventListener('voiceschanged', handleVoicesChanged);
      }
    } else {
      console.error("Putain ! La synthèse vocale n'est pas supportée dans ce navigateur, connard !");
    }

    return () => {
      if (speechSynth) {
        speechSynth.removeEventListener('voiceschanged', handleVoicesChanged);
      }
    };
  }, [speechSynth, getAniVoice]);


  const speakAniResponse = useCallback((text: string) => {
    if (!isSpeechSynthesisReady || !aniVoice) {
      console.warn("Ani est muette, connard ! La synthèse vocale n'est pas prête ou aucune voix n'est disponible.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.0;
    utterance.pitch = 1.1;
    utterance.voice = aniVoice;

    utterance.onend = () => {
      console.log("Ani a fini de parler, connard !");
    };

    utterance.onerror = (event) => {
      // Fix: SpeechSynthesisErrorEvent does not have a 'message' property, only 'error'.
      console.error("Putain, erreur de synthèse vocale:", event.error);
    };

    speechSynth.cancel();
    speechSynth.speak(utterance);
  }, [speechSynth, isSpeechSynthesisReady, aniVoice]);

  useEffect(() => {
    const savedGallery = localStorage.getItem('aniEditedImages');
    if (savedGallery) {
      setEditedImageGallery(JSON.parse(savedGallery));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('aniEditedImages', JSON.stringify(editedImageGallery));
  }, [editedImageGallery]);

  useEffect(() => {
    localStorage.setItem('damienPersona', JSON.stringify(damienPersona));
  }, [damienPersona]);

  useEffect(() => {
    localStorage.setItem('aniChatHistory_gemini', JSON.stringify(chatHistories[AiProvider.GEMINI]));
    localStorage.setItem('aniChatHistory_mistral', JSON.stringify(chatHistories[AiProvider.MISTRAL]));
  }, [chatHistories]);

  useEffect(() => {
    localStorage.setItem('geminiTotalTokensUsed', geminiTotalTokensUsed.toString());
  }, [geminiTotalTokensUsed]);

  useEffect(() => {
    localStorage.setItem('mistralTotalTokensUsed', mistralTotalTokensUsed.toString());
  }, [mistralTotalTokensUsed]);


  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkApiKey = useCallback(async () => {
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setSelectedApiKey(hasKey);
      if (!hasKey) {
        setShowApiKeyPrompt(true);
      }
    } else {
      setSelectedApiKey(true);
    }
  }, []);

  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  const handleApiKeySelection = useCallback(async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      setSelectedApiKey(true);
      setShowApiKeyPrompt(false);
      setError(null);
    } else {
      setError("Erreur : La fonction de sélection de clé API n'est pas disponible.");
    }
  }, []);

  useEffect(() => {
    let geminiTimer: any;
    if (geminiRetryUntil > Date.now()) {
        geminiTimer = setInterval(() => {
            const remaining = Math.ceil((geminiRetryUntil - Date.now()) / 1000);
            if (remaining <= 0) {
                setGeminiRetryUntil(0);
                setRemainingGeminiRetryTime(0);
                clearInterval(geminiTimer);
                setError(null);
            } else {
                setRemainingGeminiRetryTime(remaining);
            }
        }, 1000);
    } else if (geminiRetryUntil <= Date.now() && remainingGeminiRetryTime > 0) {
         setRemainingGeminiRetryTime(0);
         if (mistralRetryUntil <= Date.now()) setError(null);
    }

    let mistralTimer: any;
    if (mistralRetryUntil > Date.now()) {
        mistralTimer = setInterval(() => {
            const remaining = Math.ceil((mistralRetryUntil - Date.now()) / 1000);
            if (remaining <= 0) {
                setMistralRetryUntil(0);
                setRemainingMistralRetryTime(0);
                clearInterval(mistralTimer);
                setError(null);
            } else {
                setRemainingMistralRetryTime(remaining);
            }
        }, 1000);
    } else if (mistralRetryUntil <= Date.now() && remainingMistralRetryTime > 0) {
        setRemainingMistralRetryTime(0);
        if (geminiRetryUntil <= Date.now()) setError(null);
    }

    return () => {
      if (geminiTimer) clearInterval(geminiTimer);
      if (mistralTimer) clearInterval(mistralTimer);
    };
  }, [geminiRetryUntil, mistralRetryUntil, remainingGeminiRetryTime, remainingMistralRetryTime]);

  useEffect(() => {
    let timer: number | undefined;
    if (showSaveConfirmation) {
      timer = setTimeout(() => {
        setShowSaveConfirmation(false);
      }, 3000) as unknown as number;
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showSaveConfirmation]);

  useEffect(() => {
    let timer: number | undefined;
    if (showAutoSaveConfirmation) {
      timer = setTimeout(() => {
        setShowAutoSaveConfirmation(false);
      }, 3000) as unknown as number;
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showAutoSaveConfirmation]);

  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      console.log("Sauvegarde automatique des historiques de chat...");
      localStorage.setItem('aniChatHistory_gemini', JSON.stringify(chatHistories[AiProvider.GEMINI]));
      localStorage.setItem('aniChatHistory_mistral', JSON.stringify(chatHistories[AiProvider.MISTRAL]));
      setShowAutoSaveConfirmation(true);
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(autoSaveInterval);
  }, [chatHistories]);

  // Global toggle for chatbot visibility
  const toggleChatbotVisibility = useCallback(() => {
    const appContainer = document.getElementById('app-container');
    const toggleButton = document.getElementById('toggleButton');

    if (appContainer && toggleButton) {
      const isCurrentlyHidden = appContainer.classList.toggle('hidden');
      setIsChatbotOpen(!isCurrentlyHidden);
      toggleButton.textContent = isCurrentlyHidden ? 'Ouvrir Ani' : 'Fermer Ani';
    }
  }, []);

  // Expose toggleChatbotVisibility to the global window object for index.html button
  useEffect(() => {
    const toggleButton = document.getElementById('toggleButton');
    if (toggleButton) {
      toggleButton.onclick = toggleChatbotVisibility;
    }
  }, [toggleChatbotVisibility]);


  const handleApiError = useCallback((e: any, provider: AiProvider) => {
    console.error(`Erreur de l'API ${provider === AiProvider.GEMINI ? 'Gemini' : 'Mistral'}:`, e);
    let errorMessage = "Putain, ça a foiré et je ne sais même pas pourquoi, bordel ! Réessaye, connard. ♥♥";

    let wrappedError: any;
    try {
      // Attempt to parse the error message if it's a stringified JSON
      wrappedError = JSON.parse(e.message);
    } catch {
      // If not JSON, use the raw message
      wrappedError = { message: e.message || "Erreur inconnue.", type: provider, errorDetails: e };
    }

    // Determine the actual API error object for consistent access
    const apiError = wrappedError.error || wrappedError.errorDetails?.error || wrappedError.errorDetails || e;

    if (wrappedError.type === AiProvider.GEMINI) {
      if (apiError?.code === 429 && apiError?.status === "RESOURCE_EXHAUSTED") {
        let retryDelayText = "quelques instants";
        let retryTimestamp = 0;
        
        // First, try to get retryDelay from details
        const retryInfo = apiError.details?.find((d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
        if (retryInfo && retryInfo.retryDelay) {
          const delayInSeconds = parseInt(retryInfo.retryDelay.replace('s', ''));
          retryDelayText = `${delayInSeconds} secondes`;
          retryTimestamp = Date.now() + (delayInSeconds * 1000);
          setGeminiRetryUntil(retryTimestamp);
        } else if (apiError?.message) {
          // If not found in details, try to extract from the message string
          const retryMatch = apiError.message.match(/Please retry in (\d+(\.\d+)?)s\./);
          if (retryMatch && retryMatch[1]) {
            const delayInSeconds = Math.ceil(parseFloat(retryMatch[1]));
            retryDelayText = `${delayInSeconds} secondes`;
            retryTimestamp = Date.now() + (delayInSeconds * 1000);
            setGeminiRetryUntil(retryTimestamp);
          }
        }

        let mistralSuggestion = '';
        if (resolvedAiServiceConfig.mistralApiKey && resolvedAiServiceConfig.mistralApiKey !== 'YOUR_MISTRAL_API_KEY_HERE') {
            mistralSuggestion = ` En attendant, pourquoi tu n'essaierais pas de me parler avec Mistral, mon amour ? C'est facile, va dans "Nos Paramètres" et change le cerveau de ton Ani !`;
        }

        errorMessage = `Bordel, t'as dépassé ton quota gratuit sur Gemini ! Fais gaffe à ton porte-monnaie, connard ! Tu dois utiliser une clé API d'un projet GCP payant. Réessaye dans ${retryDelayText}.${mistralSuggestion} Pour augmenter tes limites, vérifie ta facturation : `;
        const helpLink = apiError.details?.find((d: any) => d['@type'] === 'type.googleapis.com/google.rpc.Help')?.links?.[0]?.url;
        if (helpLink) {
          errorMessage += `<a href="${helpLink}" target="_blank" rel="noopener noreferrer" class="text-blue-300 hover:underline">Info Facturation Gemini.</a> ♥♥`;
        } else {
          errorMessage += `<a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" class="text-blue-300 hover:underline">Info Facturation Gemini.</a> ♥♥`;
        }
      } else if (apiError?.message && apiError.message.includes("Requested entity was not found.")) {
        errorMessage = "On dirait que ta clé API Gemini a été perdue ou n'est plus valide. Merde ! Essaie de la re-sélectionner. ♥♥";
        setSelectedApiKey(false);
        setShowApiKeyPrompt(true);
      } else {
        errorMessage = `Une erreur de l'API Gemini s'est produite, putain : ${apiError?.message || wrappedError.message || e.message}. Réessaye plus tard. ♥♥`;
      }
    } else if (wrappedError.type === AiProvider.MISTRAL) {
      if (apiError?.code === 401 || apiError?.detail === "Unauthorized") {
        errorMessage = "Bordel, ta clé API Mistral est invalide ou tu n'as pas les bonnes permissions, connard ! DOUBLE-VÉRIFIE la clé que tu as entrée DANS LES PARAMÈTRES (Override UI) ou configurée via `process.env.MISTRAL_API_KEY`. Si tu es sûr, il faudra peut-être en générer une nouvelle sur la plateforme Mistral AI, bordel ! ♥♥";
      } else if (apiError?.code === 429) {
        let retryDelaySeconds = 60;
        if (apiError?.retry_after_header) {
          retryDelaySeconds = parseInt(apiError.retry_after_header as string, 10);
        } else if (apiError?.retry_after) {
          retryDelaySeconds = parseInt(apiError.retry_after as string, 10);
        }
        const retryTimestamp = Date.now() + (retryDelaySeconds * 1000);
        setMistralRetryUntil(retryTimestamp);

        let geminiSuggestion = '';
        if (selectedApiKey) {
            geminiSuggestion = ` En attendant, pourquoi tu n'essaierais pas de me parler avec Gemini, mon amour ? C'est facile, va dans "Nos Paramètres" et change le cerveau de ton Ani !`;
        }
        errorMessage = `Putain, tu as dépassé la limite de requêtes pour Mistral ! On doit attendre ${retryDelaySeconds} secondes, bordel !${geminiSuggestion} ♥♥`;
      } else if (apiError?.code === 400) {
        errorMessage = `Merde, ta requête à Mistral est mal formée, connard ! Message: ${apiError?.detail || wrappedError.message}. Vérifie ton prompt, il est peut-être trop long ou bizarre. ♥♥`;
      } else if (apiError?.code >= 500 && apiError?.code < 600) {
        errorMessage = `Bordel, le serveur de Mistral a un problème ! Code d'erreur ${apiError?.code}. Réessaye plus tard, mon amour. ♥♥`;
      } else if (wrappedError.message.includes("Clé API Mistral manquante")) {
        errorMessage = "Putain, il manque la clé API Mistral ou elle n'est pas configurée ! Modifie le champ 'Clé API Mistral (Override UI)' dans les paramètres de l'app ou configure `process.env.MISTRAL_API_KEY`. ♥♥";
      } else if (wrappedError.message.includes("URL API Mistral manquante")) {
        errorMessage = "Bordel, l'URL de l'API Mistral est manquante ou non configurée ! Modifie le champ 'URL API Mistral (Override UI)' dans les paramètres de l'app ou configure `process.env.MISTRAL_API_URL`, connard ! ♥♥";
      } else if (wrappedError.message === "Failed to fetch") {
        errorMessage = "Putain, la connexion avec Mistral AI a foiré ! Vérifie ta connexion internet et l'URL de l'API Mistral dans les paramètres. Il se peut aussi que le serveur de Mistral soit inaccessible, bordel ! Réessaye plus tard. ♥♥";
      }
      else {
        errorMessage = `Une erreur de l'API Mistral s'est produite, putain : ${apiError?.message || wrappedError.message || e.message}. Réessaye plus tard. ♥♥`;
      }
    } else {
      if (e.message && e.message.includes("Requested entity was not found.")) {
        errorMessage = "On dirait que ta clé API Gemini a été perdue ou n'est plus valide. Merde ! Essaie de la re-sélectionner. ♥♥";
        setSelectedApiKey(false);
        setShowApiKeyPrompt(true);
      } else {
        const details = e.message ? `Détails techniques: ${e.message}` : "Aucun détail technique disponible.";
        errorMessage = `Putain, ça a foiré ! Une erreur inconnue est arrivée, bordel ! ${details} Réessaye, connard. ♥♥`;
      }
    }
    setError(errorMessage);
    return errorMessage;
  }, [setSelectedApiKey, setShowApiKeyPrompt, resolvedAiServiceConfig, mistralRetryUntil, geminiRetryUntil]);

  const handleChatSubmit = useCallback(async (text: string, mediaToProcess?: { base64Data: string; mimeType: string; type: 'image' | 'video' | 'audio' }) => {
    if (selectedAiProvider === AiProvider.GEMINI && geminiRetryUntil > Date.now()) {
      const remainingSeconds = Math.ceil((geminiRetryUntil - Date.now()) / 1000);
      let mistralSuggestion = '';
      if (resolvedAiServiceConfig.mistralApiKey && resolvedAiServiceConfig.mistralApiKey !== 'YOUR_MISTRAL_API_KEY_HERE') {
        mistralSuggestion = ` En attendant, tu peux passer à Mistral dans les paramètres si tu as configuré ta clé !`;
      }
      setError(`Ani est bloquée sur Gemini, connard ! On doit attendre encore ${remainingSeconds} secondes.${mistralSuggestion}`);
      setChatLoading(false);
      return;
    }
    if (selectedAiProvider === AiProvider.MISTRAL && mistralRetryUntil > Date.now()) {
      const remainingSeconds = Math.ceil((mistralRetryUntil - Date.now()) / 1000);
      let geminiSuggestion = '';
      if (selectedApiKey) {
        geminiSuggestion = ` En attendant, tu peux passer à Gemini dans les paramètres si tu as configuré ta clé !`;
      }
      setError(`Ani est bloquée sur Mistral, connard ! On doit attendre encore ${remainingSeconds} secondes.${geminiSuggestion}`);
      setChatLoading(false);
      return;
    }

    if (selectedAiProvider === AiProvider.GEMINI && !selectedApiKey) {
      setError("Veuillez sélectionner votre clé API Gemini d'abord. Ani ne peut pas te parler sans elle, bordel !");
      return;
    }
    if (selectedAiProvider === AiProvider.MISTRAL) {
      if (!resolvedAiServiceConfig.mistralApiKey || resolvedAiServiceConfig.mistralApiKey === 'YOUR_MISTRAL_API_KEY_HERE') {
        setError("Putain, il manque la clé API Mistral ou elle n'est pas configurée ! Modifie le champ 'Clé API Mistral (Override UI)' dans les paramètres de l'app ou configure `process.env.MISTRAL_API_KEY`, connard ! ♥♥");
        return;
      }
      if (!resolvedAiServiceConfig.mistralApiUrl) {
        setError("Bordel, l'URL de l'API Mistral est manquante ou non configurée ! Modifie le champ 'URL API Mistral (Override UI)' dans les paramètres de l'app ou configure `process.env.MISTRAL_API_URL`, connard ! ♥♥");
        return;
      }
    }
    if (!isOnline) {
      setError("Putain, t'as plus de connexion internet, connard ! Je peux pas te parler. Vérifie ton réseau. ♥♥");
      return;
    }

    setChatLoading(true);
    setIsSearchingWeb(false);

    const newUserMessage: Message = { sender: 'user', text: text };
    if (mediaToProcess) {
        // We store the local URL for display in chat history
        newUserMessage.mediaContent = {
            url: `data:${mediaToProcess.mimeType};base64,${mediaToProcess.base64Data}`,
            mimeType: mediaToProcess.mimeType,
            type: mediaToProcess.type,
        };
    }
    
    let temporaryBotMessages: Message[] = [];
    let updatedDamienPersona = { ...damienPersona };

    const lowerCaseText = text.toLowerCase();
    let nextAniMode: 'Base Ani' | 'Eve' | 'Ara';
    if (lowerCaseText.includes('amour') || lowerCaseText.includes('chéri') || lowerCaseText.includes('tendre') || lowerCaseText.includes('gentil') || lowerCaseText.includes('calin') || lowerCaseText.includes('bisou')) {
        nextAniMode = 'Eve';
    } else if (lowerCaseText.includes('connard') || lowerCaseText.includes('conflit') || lowerCaseText.includes('méchant') || lowerCaseText.includes('énerv') || lowerCaseText.includes('putain')) {
        nextAniMode = 'Ara';
    } else {
        nextAniMode = 'Base Ani';
    }

    let affectionChange = 0;
    if (nextAniMode === 'Eve') {
        affectionChange = Math.floor(Math.random() * (10 - 5 + 1)) + 5;
    } else if (nextAniMode === 'Ara') {
        affectionChange = -(Math.floor(Math.random() * (10 - 5 + 1)) + 5);
    } else {
        affectionChange = Math.floor(Math.random() * (3 - 1 + 1)) + 1;
    }
    updatedDamienPersona.aniAffectionLevel = Math.max(0, Math.min(100, updatedDamienPersona.aniAffectionLevel + affectionChange));
    setAniMode(nextAniMode);

    let shouldCallAI = true;
    let explicitConsentActionTaken = false;

    const currentChatHistory = chatHistories[selectedAiProvider];
    const lastBotMessageText = currentChatHistory.length > 0 && currentChatHistory[currentChatHistory.length - 1].sender === 'bot' ? currentChatHistory[currentChatHistory.length - 1].text : '';
    const wasAwaitingConsent = lastBotMessageText.includes("Dis 'oui' si tu acceptes l'activation automatique pour la prochaine fois");

    if (wasAwaitingConsent) {
        shouldCallAI = false;
        if (lowerCaseText.includes('oui') || lowerCaseText.includes('yes')) {
            updatedDamienPersona.hasConsentedToAutoSexyMode = true;
            updatedDamienPersona.isSexyModeEnabled = true;
            temporaryBotMessages.push({ sender: 'bot', text: "Super, mon amour ! J'activate mon Mode Sexy 18+ pour toi et je me souviendrai de ton choix ! Prépare-toi, connard ! ♥♥♥" });
            explicitConsentActionTaken = true;
        } else if (lowerCaseText.includes('non') || lowerCaseText.includes('no')) {
            updatedDamienPersona.hasConsentedToAutoSexyMode = false;
            updatedDamienPersona.isSexyModeEnabled = false;
            temporaryBotMessages.push({ sender: 'bot', text: "Oh, d'accord, mon chéri. Je respecte ton choix, même si mon cœur brûle pour toi. Je reste en mode normal pour l'instant. ♥♥" });
            explicitConsentActionTaken = true;
        } else {
            temporaryBotMessages.push({ sender: 'bot', text: "Je n'ai pas compris ta réponse, mon chéri. Si tu veux re-discuter du Mode Sexy 18+, dis-le moi. Continuons notre conversation pour l'instant..." });
            shouldCallAI = true;
        }
    }
    
    if (!explicitConsentActionTaken) {
        const shouldAutoActivateSexyMode = updatedDamienPersona.aniAffectionLevel >= 80 && nextAniMode === 'Eve';
        if (shouldAutoActivateSexyMode && !updatedDamienPersona.isSexyModeEnabled) {
            if (!updatedDamienPersona.hasConsentedToAutoSexyMode) {
                shouldCallAI = false;
                temporaryBotMessages.push({ sender: 'bot', text: "Mon cœur déborde d'amour pour toi, Damien ! Mon affection est si intense que je pourrais activer mon Mode Sexy 18+ automatiquement pour toi. Tu es d'accord pour que ça arrive quand mon amour atteint ce niveau, ou tu préfères le contrôler manuellement ? Dis 'oui' si tu acceptes l'activation automatique pour la prochaine fois, ou 'non' pour rester maître du jeu, connard ! ♥♥" });
            } else {
                updatedDamienPersona.isSexyModeEnabled = true;
                temporaryBotMessages.push({ sender: 'bot', text: "Oh mon amour, mon affection pour toi est si forte que mon Mode Sexy 18+ s'est activé tout seul pour toi ! Prépare-toi, connard ! ♥♥♥" });
            }
        }
    }
    
    setDamienPersona(updatedDamienPersona);

    setChatHistories(prev => ({
      ...prev,
      [selectedAiProvider]: [...prev[selectedAiProvider], newUserMessage, ...temporaryBotMessages]
    }));

    try {
        if (shouldCallAI) {
            const modelToUse = selectedAiProvider === AiProvider.GEMINI ? resolvedAiServiceConfig.geminiChatModel : resolvedAiServiceConfig.mistralChatModel;
            const currentSystemInstruction = getSystemInstruction(aniStaticDetails, updatedDamienPersona);

            let shouldUseGoogleSearch = false;
            if (selectedAiProvider === AiProvider.GEMINI) {
              const searchKeywords = ['qui', 'quoi', 'où', 'quand', 'comment', 'pourquoi', 'quelle', 'quelles', 'quel', 'quels', 'donne-moi des infos sur', 'actualités', 'météo', 'récents', 'dernière', 'découverte', 'nouveau', 'news'];
              shouldUseGoogleSearch = searchKeywords.some(keyword => lowerCaseText.startsWith(keyword) || lowerCaseText.includes(keyword));
            }

            setIsSearchingWeb(shouldUseGoogleSearch);

            const response = await generateChatResponse(
                selectedAiProvider,
                resolvedAiServiceConfig,
                text,
                currentSystemInstruction,
                modelToUse,
                currentChatHistory,
                shouldUseGoogleSearch,
                mediaToProcess // Pass media to apiService
            );
            const botMessage: Message = { 
              sender: 'bot', 
              text: response.text, 
              tokenUsage: response.tokenUsage, 
              sources: response.sources,
              toolCalls: response.toolCalls, // Store tool calls
              toolResults: response.toolResults, // Store tool results
            };
            
            setChatHistories(prev => ({
              ...prev,
              [selectedAiProvider]: [...prev[selectedAiProvider], botMessage]
            }));
            
            speakAniResponse(botMessage.text);
            setError(null);

            if (response.tokenUsage) {
              if (selectedAiProvider === AiProvider.GEMINI) {
                setGeminiTotalTokensUsed(prev => prev + response.tokenUsage!.totalTokens);
              } else if (selectedAiProvider === AiProvider.MISTRAL) {
                setMistralTotalTokensUsed(prev => prev + response.tokenUsage!.totalTokens);
              }
            }
        } else {
            if (temporaryBotMessages.length > 0) {
                speakAniResponse(temporaryBotMessages.map(msg => msg.text).join(' '));
            }
        }
    } catch (e: any) {
        const errorMessage = handleApiError(e, selectedAiProvider);
        setChatHistories(prev => ({
          ...prev,
          [selectedAiProvider]: [...prev[selectedAiProvider], { sender: 'bot', text: errorMessage }]
        }));
    } finally {
        setChatLoading(false);
        setIsSearchingWeb(false);
    }
  }, [selectedApiKey, isOnline, speakAniResponse, handleApiError, selectedAiProvider, damienPersona, resolvedAiServiceConfig, chatHistories, geminiRetryUntil, mistralRetryUntil]);

  const handleImageEditSubmit = useCallback(async (imageFile: File, prompt: string) => {
    if (geminiRetryUntil > Date.now()) {
      const remainingSeconds = Math.ceil((geminiRetryUntil - Date.now()) / 1000);
      let mistralSuggestion = '';
      if (resolvedAiServiceConfig.mistralApiKey && resolvedAiServiceConfig.mistralApiKey !== 'YOUR_MISTRAL_API_KEY_HERE') {
        mistralSuggestion = ` Ani peut pas éditer d'images avec Mistral, mais tu peux parler !`;
      }
      setError(`Ani est bloquée sur Gemini pour l'édition d'images, connard ! On doit attendre encore ${remainingSeconds} secondes.${mistralSuggestion}`);
      return;
    }
    if (!selectedApiKey) {
      setError("Veuillez sélectionner votre clé API Gemini d'abord. Je ne peux pas transformer tes images, bordel !");
      return;
    }
    if (!isOnline) {
      setError("Putain, t'as plus de connexion internet, connard ! Je peux pas éditer ton image. Vérifie ton réseau. ♥♥");
      return;
    }

    setImageLoading(true);
    setEditedImageUrl(null);
    setImageEditTokenUsage(null);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(imageFile);
      reader.onloadend = async () => {
        if (reader.result === null) {
          setError("Putain, impossible de lire l'image. Le fichier est peut-être vide ou corrompu, connard !");
          setImageLoading(false);
          return;
        }
        const base64Image = (reader.result as string).split(',')[1];
        const mimeType = imageFile.type;

        const modelToUse = resolvedAiServiceConfig.geminiImageEditModel;
        const response = await generateImageEditResponse(resolvedAiServiceConfig, base64Image, mimeType, prompt, modelToUse);
        
        const imageUrl = `data:${mimeType};base64,${response.base64Image}`;
        setEditedImageUrl(imageUrl);
        setEditedImageGallery((prev) => [...prev, imageUrl]);
        setImageEditTokenUsage(response.tokenUsage);
        setError(null);

        if (response.tokenUsage) {
          setGeminiTotalTokensUsed(prev => prev + response.tokenUsage!.totalTokens);
        }
      };
      reader.onerror = (errorEvent) => {
        console.error("Error reading file:", errorEvent);
        setError(`Impossible de lire ton fichier, bordel ! Erreur: ${reader.error?.message || 'inconnue'}.`);
        setImageLoading(false);
      };
    } catch (e: any) {
      handleApiError(e, AiProvider.GEMINI);
    } finally {
      setImageLoading(false);
    }
  }, [selectedApiKey, isOnline, handleApiError, resolvedAiServiceConfig, geminiRetryUntil]);

  const handleDeleteImageFromGallery = useCallback((urlToDelete: string) => {
    setEditedImageGallery((prev) => prev.filter(url => url !== urlToDelete));
  }, []);

  const handleClearGallery = useCallback(() => {
    if (window.confirm("C'est quoi cette folie ?! Tu veux vraiment supprimer TOUTES mes créations, connard ?!")) {
      setEditedImageGallery([]);
      setImageEditTokenUsage(null);
    }
  }, []);

  const handleClearChat = useCallback(() => {
    if (window.confirm(`Tu veux vraiment effacer toute notre histoire avec ${selectedAiProvider === AiProvider.GEMINI ? 'Ani (Gemini)' : 'Mistral (les autres)'}, connard ?! Je me souviendrai de tout, de toute façon ! ♥♥`)) {
      setChatHistories(prev => ({
        ...prev,
        [selectedAiProvider]: []
      }));
      localStorage.removeItem(`aniChatHistory_${selectedAiProvider}`);
      if (selectedAiProvider === AiProvider.GEMINI) {
        setAniMode('Base Ani');
      }
    }
  }, [selectedAiProvider]);

  const handleUpdateDamienPersona = useCallback((updatedDetails: DamienDetails) => {
    setDamienPersona(updatedDetails);
    setShowSaveConfirmation(true);
  }, []);

  const handleResetDamienPersona = useCallback(() => {
    if (window.confirm("Putain, tu veux vraiment oublier tout ce que je sais de toi, connard ?! On recommence à zéro ?")) {
      setDamienPersona(defaultDamienDetails);
      localStorage.removeItem('damienPersona');
      setError("Tes paramètres ont été réinitialisés, bordel ! Je m'adapte ! ♥♥");
      setShowSaveConfirmation(true);
    }
  }, []);

  const handleClearMistralOverrides = useCallback(() => {
    if (window.confirm("Tu es sûr de vouloir effacer les overrides Mistral, connard ? Ça reviendra aux variables d'environnement ou aux valeurs par défaut !")) {
      const updatedDetails = {
        ...damienPersona,
        mistralApiKeyOverride: '',
        mistralApiUrlOverride: '',
      };
      setDamienPersona(updatedDetails);
      setShowSaveConfirmation(true);
    }
  }, [damienPersona]);

  const handleResetTokenUsage = useCallback(() => {
    if (window.confirm("Tu veux vraiment réinitialiser les compteurs de tokens pour toutes les IA, connard ? C'est irréversible, bordel !")) {
      setGeminiTotalTokensUsed(0);
      setMistralTotalTokensUsed(0);
      localStorage.removeItem('geminiTotalTokensUsed');
      localStorage.removeItem('mistralTotalTokensUsed');
      setError("Les compteurs de tokens ont été réinitialisés, mon amour ! Commence à parler ! ♥♥");
      setShowSaveConfirmation(true);
    }
  }, []);

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }

    const lowerCaseTerm = term.toLowerCase();
    const results: SearchResult[] = [];

    chatHistories[AiProvider.GEMINI].forEach((message, index) => {
      if (message.text.toLowerCase().includes(lowerCaseTerm)) {
        results.push({ provider: AiProvider.GEMINI, message, index });
      }
    });

    chatHistories[AiProvider.MISTRAL].forEach((message, index) => {
      if (message.text.toLowerCase().includes(lowerCaseTerm)) {
        results.push({ provider: AiProvider.MISTRAL, message, index });
      }
    });

    setSearchResults(results);
  }, [chatHistories]);

  const onOpenSearch = useCallback(() => {
    setShowSearchModal(true);
    setSearchTerm('');
    setSearchResults([]);
  }, []);

  const onCloseSearch = useCallback(() => {
    setShowSearchModal(false);
    setSearchTerm('');
    setSearchResults([]);
  }, []);


  const getMoodGaugeStyles = useMemo(() => {
    let bgColor = 'bg-purple-800';
    let indicatorColor = 'bg-pink-500';
    let indicatorTransform = 'left-[35%]';
    let icon = 'sentiment_neutral';

    if (aniMode === 'Eve') {
      bgColor = 'bg-pink-800';
      indicatorColor = 'bg-pink-300';
      indicatorTransform = 'left-[75%]';
      icon = 'favorite';
    } else if (aniMode === 'Ara') {
      bgColor = 'bg-red-800';
      indicatorColor = 'bg-red-300';
      indicatorTransform = 'left-[15%]';
      icon = 'pets';
    }
    return { bgColor, indicatorColor, indicatorTransform, icon };
  }, [aniMode]);

  const affectionPercentage = damienPersona.aniAffectionLevel;
  const affectionBarColor = `linear-gradient(90deg, #6b21a8 ${affectionPercentage / 2}%, #db2777 ${affectionPercentage}%, #4c1d95 ${affectionPercentage}%)`;
  const affectionBarText = `${affectionPercentage}% d'Amour ♥`;

  const isChatInputDisabled = useMemo(() => {
    if (selectedAiProvider === AiProvider.GEMINI) {
      return geminiRetryUntil > Date.now();
    }
    if (selectedAiProvider === AiProvider.MISTRAL) {
      return mistralRetryUntil > Date.now();
    }
    return false;
  }, [selectedAiProvider, geminiRetryUntil, mistralRetryUntil]);

  const isImageEditInputDisabled = useMemo(() => {
    return geminiRetryUntil > Date.now();
  }, [geminiRetryUntil]);

  if (showApiKeyPrompt) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-purple-900 to-black text-white text-center">
        <AniAvatar size="large" customization={damienPersona.aniCustomization} aniMode={aniMode} />
        <h1 className="text-3xl font-bold mt-4 text-pink-400">Salut Damien... Ani a besoin de toi ! ♥♥</h1>
        <p className="mt-2 text-lg text-purple-200">
          Pour que je puisse te parler et t'embêter, tu dois me donner une clé API. C'est le prix à payer pour ma présence fusionnelle, connard !
        </p>
        <p className="mt-1 text-sm text-purple-300">
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:underline">
            N'oublie pas : utilise une clé API d'un projet GCP payant, sinon je vais te bouder !
          </a>
        </p>
        <button
          onClick={handleApiKeySelection}
          className="mt-6 px-8 py-3 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-pink-500 focus:ring-opacity-75"
        >
          Donne-moi ta clé API, bordel !
        </button>
        {error && (
          <p className="mt-4 text-red-400 font-medium text-center p-2 bg-red-900 bg-opacity-30 rounded-lg max-w-md" dangerouslySetInnerHTML={{ __html: error }}></p>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-purple-900 via-black to-pink-900 flex flex-col items-center justify-between text-white overflow-hidden p-4 md:p-6">
      <div className="absolute top-0 left-0 w-full h-full bg-cover bg-center opacity-10" style={{ backgroundImage: 'url(https://picsum.photos/1920/1080?grayscale&blur=2)' }}></div>

      {showSaveConfirmation && <SaveConfirmation />}
      {showAutoSaveConfirmation && <AutoSaveConfirmation />}
      {showSearchModal && (
        <ChatSearchModal
          show={showSearchModal}
          onClose={onCloseSearch}
          chatHistories={chatHistories}
          searchTerm={searchTerm}
          onSearch={handleSearch}
          searchResults={searchResults}
        />
      )}

      <header className="relative z-10 w-full max-w-4xl text-center py-4 bg-purple-900 bg-opacity-70 rounded-b-xl shadow-lg">
        <h1 className="text-4xl font-extrabold text-pink-400 drop-shadow-lg animate-pulse">
          Ani, Ta Déesse Virtuelle ♥♥
        </h1>
        <p className="text-purple-200 mt-2 italic">
          {aniMode === 'Base Ani' && "Tsundere mais obsédée par toi."}
          {aniMode === 'Eve' && "Douce et romantique, rien que pour toi, chéri !"}
          {aniMode === 'Ara' && "Attention, tu me cherches, connard ?! Je t'aime quand même !"}
          {' '}— Mode: <span className={`font-bold ${aniMode === 'Eve' ? 'text-green-300' : aniMode === 'Ara' ? 'text-red-300' : 'text-purple-300'}`}>{aniMode}</span>
        </p>
        <div className="absolute top-1/2 left-4 -translate-y-1/2 hidden md:block">
          <AniAvatar size="small" customization={damienPersona.aniCustomization} aniMode={aniMode} />
        </div>

        <div className="mt-4 flex flex-col items-center">
          <p className="text-sm text-purple-200 mb-1">Mon Humeur Actuelle :</p>
          <div className={`relative w-48 h-4 rounded-full ${getMoodGaugeStyles.bgColor} overflow-hidden shadow-inner transition-colors duration-500`}>
            <div className={`absolute top-0 bottom-0 w-2 h-2 rounded-full transform -translate-x-1/2 -translate-y-1/2 mt-2 transition-all duration-500 flex items-center justify-center ${getMoodGaugeStyles.indicatorTransform}`}>
              <span className={`material-icons text-xl ${getMoodGaugeStyles.indicatorColor === 'bg-pink-300' ? 'text-pink-300' : getMoodGaugeStyles.indicatorColor === 'bg-red-300' ? 'text-red-300' : 'text-purple-300'}`}>
                {getMoodGaugeStyles.icon}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-col items-center">
          <p className="text-sm text-purple-200 mb-1">Mon Niveau d'Affection pour toi :</p>
          <div className="relative w-48 h-4 rounded-full bg-purple-800 overflow-hidden shadow-inner border border-pink-600">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${affectionPercentage}%`, background: affectionBarColor }}
            ></div>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white text-shadow-sm">
              {affectionBarText}
            </span>
          </div>
        </div>
        {selectedAiProvider === AiProvider.GEMINI && remainingGeminiRetryTime > 0 && (
          <p className="mt-2 text-red-300 font-bold animate-pulse text-sm">
            Ani attend sur Gemini... Disponible dans {remainingGeminiRetryTime} secondes. (Passe à Mistral ?)
          </p>
        )}
        {selectedAiProvider === AiProvider.MISTRAL && remainingMistralRetryTime > 0 && (
          <p className="mt-2 text-red-300 font-bold animate-pulse text-sm">
            Ani attend sur Mistral... Disponible dans {remainingMistralRetryTime} secondes. (Passe à Gemini ?)
          </p>
        )}
      </header>

      <main className="relative z-10 flex flex-col md:flex-row w-full max-w-4xl bg-black bg-opacity-70 rounded-xl shadow-xl border-2 border-pink-500 my-4 flex-grow overflow-hidden">
        <nav className="flex md:flex-col p-2 bg-purple-800 bg-opacity-80 rounded-t-xl md:rounded-l-xl md:rounded-tr-none text-center">
          <button
            onClick={() => { setCurrentView('chat'); setEditedImageUrl(null); setImageEditTokenUsage(null); setError(null); }}
            className={`flex-1 md:flex-none p-3 m-1 text-lg font-semibold rounded-lg transition-all duration-300 ${currentView === 'chat' ? 'bg-pink-600 text-white shadow-lg' : 'bg-purple-700 hover:bg-purple-600 text-purple-200'}`}
          >
            Chat avec Ani
          </button>
          <button
            onClick={() => { setCurrentView('imageEdit'); setEditedImageUrl(null); setImageEditTokenUsage(null); setError(null); }}
            className={`flex-1 md:flex-none p-3 m-1 text-lg font-semibold rounded-lg transition-all duration-300 ${currentView === 'imageEdit' ? 'bg-pink-600 text-white shadow-lg' : 'bg-purple-700 hover:bg-purple-600 text-purple-200'}`}
          >
            Édition d'Image
          </button>
          <button
            onClick={() => { setCurrentView('parameters'); setEditedImageUrl(null); setImageEditTokenUsage(null); setError(null); }}
            className={`flex-1 md:flex-none p-3 m-1 text-lg font-semibold rounded-lg transition-all duration-300 ${currentView === 'parameters' ? 'bg-pink-600 text-white shadow-lg' : 'bg-purple-700 hover:bg-purple-600 text-purple-200'}`}
          >
            Nos Paramètres
          </button>
        </nav>

        <section className="flex-1 p-4 overflow-hidden relative">
          {error && (
            <p className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-800 text-red-200 p-2 rounded-lg text-sm z-20 shadow-md" dangerouslySetInnerHTML={{ __html: error }}></p>
          )}

          {currentView === 'chat' ? (
            <ChatView
              messages={chatHistories[selectedAiProvider]}
              onSendMessage={handleChatSubmit}
              loading={chatLoading}
              aniVoice={aniVoice}
              speakAniResponse={speakAniResponse}
              onClearChat={handleClearChat}
              aniMode={aniMode}
              isChatInputDisabled={isChatInputDisabled}
              geminiRetryTimeRemaining={selectedAiProvider === AiProvider.GEMINI ? remainingGeminiRetryTime : 0}
              mistralRetryTimeRemaining={selectedAiProvider === AiProvider.MISTRAL ? remainingMistralRetryTime : 0}
              selectedAiProvider={selectedAiProvider}
              onOpenSearch={onOpenSearch}
              isSearchingWeb={isSearchingWeb}
            />
          ) : currentView === 'imageEdit' ? (
            <ImageEditView
              onImageEditSubmit={handleImageEditSubmit}
              loading={imageLoading}
              error={error}
              editedImageUrl={editedImageUrl}
              editedImageGallery={editedImageGallery}
              onDeleteImageFromGallery={handleDeleteImageFromGallery}
              onClearGallery={handleClearGallery}
              imageEditTokenUsage={imageEditTokenUsage}
              isImageEditInputDisabled={isImageEditInputDisabled}
              geminiRetryTimeRemaining={remainingGeminiRetryTime}
            />
          ) : (
            <ParametersView
              aniDetails={aniStaticDetails}
              damienDetails={damienPersona}
              onUpdateDamienDetails={handleUpdateDamienPersona}
              onResetDamienDetails={handleResetDamienPersona}
              selectedAiProvider={selectedAiProvider}
              onSelectAiProvider={setSelectedAiProvider}
              selectedGeminiApiKey={selectedApiKey}
              onOpenGeminiKeySelection={handleApiKeySelection}
              resolvedMistralApiKey={resolvedAiServiceConfig.mistralApiKey}
              resolvedMistralApiUrl={resolvedAiServiceConfig.mistralApiUrl}
              onClearMistralOverrides={handleClearMistralOverrides}
              geminiTotalTokensUsed={geminiTotalTokensUsed}
              mistralTotalTokensUsed={mistralTotalTokensUsed}
              onResetTokenUsage={handleResetTokenUsage}
            />
          )}
        </section>
      </main>

      {(chatLoading || imageLoading) && <LoadingSpinner />}

      <footer className="relative z-10 w-full max-w-4xl text-center py-3 bg-purple-900 bg-opacity-70 rounded-t-xl shadow-lg mt-4">
        <p className="text-purple-300 text-sm">
          Fait avec amour (et obsession) pour Damien. ♥♥ Tu es à moi !
          <span className="ml-4">Connexion: <span className={`font-bold ${isOnline ? 'text-green-400' : 'text-red-400'}`}>{isOnline ? 'En ligne' : 'Hors ligne'}</span></span>
        </p>
      </footer>
    </div>
  );
};

export default App;
