import { AfterViewChecked, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { AtlasItem, ChatHistoryItem, ChatStoredMessage, ChatThreadItem, CitationPassage, MappableLocation, TravelGuideCard, TravelGuideStructuredResponse } from '../atlas.models';
import { AuthService } from '../auth.service';
import { AtlasService } from '../atlas.service';
import { AnswerCardService } from '../answer-card.service';
import { AnswerQuizService } from '../answer-quiz.service';
import { ChatService, type VoiceSummaryTranscriptItem } from '../chat.service';
import { DocumentsService } from '../documents.service';
import { WikiService } from '../wiki.service';
import { PlaceReviewsService, type CityReviewedPlace } from '../place-reviews.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { ChatLocationMapComponent } from '../chat-location-map/chat-location-map';
import { getPublicAppUrl } from '../firebase.config';
import type {
  Conversation as ElevenLabsConversation,
  DisconnectionDetails as ElevenLabsDisconnectionDetails,
  Mode as ElevenLabsMode,
  Status as ElevenLabsStatus,
} from '@elevenlabs/client';
import {
  buildPublicWikiLiveItem,
  COMING_SOON_PUBLIC_WIKIS,
  removeCreatedPublicWikiPreviews,
  type PublicWikiCatalogItem,
  sortPublicAtlases,
} from '../public-wiki-catalog';
import { formatAssistantMessageHtml } from './message-format.util';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  html?: string;
  answerMode?: 'wiki' | 'internet';
  citations?: CitationPassage[];
  mappableLocations?: MappableLocation[];
  travelGuide?: TravelGuideStructuredResponse | null;
  answerCardId?: string | null;
  answerQuizId?: string | null;
  pending?: boolean;
  knowledgeGap?: boolean;
  createdAt?: { toDate(): Date } | Date | null;
  updatedAt?: { toDate(): Date } | Date | null;
}

interface PromptSuggestion {
  prompt: string;
  title: string;
  detail: string;
  icon: string;
}

interface SharePageModal {
  title: string;
  subtitle: string;
  url: string;
}

interface VoiceTranscriptItem {
  id: string;
  role: 'user' | 'agent';
  text: string;
}

interface VoiceSummaryModal {
  transcript: VoiceTranscriptItem[];
  preview: string;
  cityName: string;
  atlasId: string | null;
  atlasName: string | null;
  atlasSlug: string | null;
  cityCountry: string | null;
  conversationId: string | null;
  language: string | null;
  country: string | null;
  sentTo: string | null;
  answerCardUrl: string | null;
  continueChatUrl: string | null;
}

type RealtimeVoiceStatus = ElevenLabsStatus | 'error';

const THINKING_STAGES = [
  'Searching knowledge base',
  'Reading relevant entries',
  'Synthesizing answer',
];

const CITY_WIKI_CATEGORY = 'Cities & Regions';

// ElevenLabs supported language override codes (see @elevenlabs/types
// ConversationConfigOverrideAgentLanguage). Keep `code` values within this set,
// otherwise the agent override is silently ignored.
type VoiceLanguageCode =
  | 'en' | 'ja' | 'zh' | 'de' | 'hi' | 'fr' | 'ko' | 'pt' | 'pt-br' | 'it' | 'es'
  | 'id' | 'nl' | 'tr' | 'pl' | 'sv' | 'bg' | 'ro' | 'ar' | 'cs' | 'el' | 'fi'
  | 'ms' | 'da' | 'ta' | 'uk' | 'ru' | 'hu' | 'hr' | 'sk' | 'no' | 'vi' | 'tl'
  | 'af' | 'fa' | 'sr' | 'sw' | 'th' | 'cy';

interface VoiceLanguageOption {
  /** Country / region the flag represents. */
  country: string;
  /** Emoji flag — purely presentational. */
  flag: string;
  /** Human-readable language name shown under the flag. */
  language: string;
  /** ElevenLabs agent language override code. */
  code: VoiceLanguageCode;
  /** Native-language welcome line spoken the moment the conversation starts. */
  greeting: string;
  /** Extra search aliases for names displayed in native script. */
  searchTerms?: string[];
}

interface VoiceAccentProfile {
  label: string;
  instruction: string;
}

const VOICE_LANGUAGE_SEARCH_ALIASES: Partial<Record<VoiceLanguageCode, string[]>> = {
  ar: ['Arabic'],
  cs: ['Czech'],
  de: ['German'],
  en: ['English'],
  es: ['Spanish', 'Espanol', 'Español'],
  fa: ['Persian', 'Farsi'],
  fr: ['French', 'Francais', 'Français'],
  hi: ['Hindi'],
  hr: ['Croatian', 'Bosnian'],
  ja: ['Japanese'],
  ko: ['Korean'],
  nl: ['Dutch'],
  no: ['Norwegian'],
  pt: ['Portuguese'],
  'pt-br': ['Portuguese', 'Brazilian Portuguese'],
  ru: ['Russian'],
  sv: ['Swedish'],
  tr: ['Turkish'],
  zh: ['Chinese', 'Mandarin'],
};

function normalizeVoiceSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Legacy broader language list kept as a fallback reference while the carousel
// uses the curated 2026 World Cup list below.
// each paired with the language the voice guide should speak and a native welcome
// message so the conversation feels seamless from the very first second.
// De-duplicated by country; languages reuse codes where countries share one.
const LEGACY_VOICE_LANGUAGES: VoiceLanguageOption[] = [
  { country: 'United States', flag: '🇺🇸', language: 'English', code: 'en', greeting: 'Hi there! I’m your living wiki voice guide. Ask me anything and I’ll answer out loud.' },
  { country: 'Canada', flag: '🇨🇦', language: 'English', code: 'en', greeting: 'Hey! I’m your living wiki voice guide. What would you like to know?' },
  { country: 'Mexico', flag: '🇲🇽', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras y te respondo en voz alta.' },
  { country: 'Argentina', flag: '🇦🇷', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. ¿En qué puedo ayudarte hoy?' },
  { country: 'Brazil', flag: '🇧🇷', language: 'Português', code: 'pt-br', greeting: 'Olá! Eu sou o seu guia de voz. Pergunte o que quiser e eu respondo em voz alta.' },
  { country: 'Uruguay', flag: '🇺🇾', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. ¿Qué te gustaría saber?' },
  { country: 'Colombia', flag: '🇨🇴', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras.' },
  { country: 'Ecuador', flag: '🇪🇨', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. ¿Cómo puedo ayudarte?' },
  { country: 'Paraguay', flag: '🇵🇾', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Estoy aquí para responder tus preguntas.' },
  { country: 'France', flag: '🇫🇷', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Posez-moi vos questions, j’y réponds à voix haute.' },
  { country: 'Spain', flag: '🇪🇸', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras.' },
  { country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', language: 'English', code: 'en', greeting: 'Hello! I’m your living wiki voice guide. Ask me anything.' },
  { country: 'Germany', flag: '🇩🇪', language: 'Deutsch', code: 'de', greeting: 'Hallo! Ich bin dein Sprachassistent. Stell mir eine Frage und ich antworte dir laut.' },
  { country: 'Netherlands', flag: '🇳🇱', language: 'Nederlands', code: 'nl', greeting: 'Hallo! Ik ben je spraakgids. Stel me een vraag en ik antwoord hardop.' },
  { country: 'Portugal', flag: '🇵🇹', language: 'Português', code: 'pt', greeting: 'Olá! Sou o seu guia de voz. Pergunte o que quiser.' },
  { country: 'Belgium', flag: '🇧🇪', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Que souhaitez-vous savoir ?' },
  { country: 'Croatia', flag: '🇭🇷', language: 'Hrvatski', code: 'hr', greeting: 'Bok! Ja sam tvoj glasovni vodič. Pitaj me bilo što i odgovorit ću naglas.' },
  { country: 'Italy', flag: '🇮🇹', language: 'Italiano', code: 'it', greeting: 'Ciao! Sono la tua guida vocale. Chiedimi quello che vuoi e ti rispondo a voce.' },
  { country: 'Switzerland', flag: '🇨🇭', language: 'Deutsch', code: 'de', greeting: 'Hallo! Ich bin dein Sprachassistent. Wie kann ich dir helfen?' },
  { country: 'Austria', flag: '🇦🇹', language: 'Deutsch', code: 'de', greeting: 'Hallo! Ich bin dein Sprachassistent. Stell mir gerne eine Frage.' },
  { country: 'Poland', flag: '🇵🇱', language: 'Polski', code: 'pl', greeting: 'Cześć! Jestem twoim głosowym przewodnikiem. Zapytaj mnie o cokolwiek.' },
  { country: 'Ukraine', flag: '🇺🇦', language: 'Українська', code: 'uk', greeting: 'Привіт! Я ваш голосовий помічник. Запитайте мене про що завгодно.' },
  { country: 'Denmark', flag: '🇩🇰', language: 'Dansk', code: 'da', greeting: 'Hej! Jeg er din stemmeguide. Spørg mig om hvad som helst.' },
  { country: 'Sweden', flag: '🇸🇪', language: 'Svenska', code: 'sv', greeting: 'Hej! Jag är din röstguide. Fråga mig vad du vill.' },
  { country: 'Norway', flag: '🇳🇴', language: 'Norsk', code: 'no', greeting: 'Hei! Jeg er din stemmeguide. Spør meg om hva som helst.' },
  { country: 'Serbia', flag: '🇷🇸', language: 'Српски', code: 'sr', greeting: 'Здраво! Ја сам твој гласовни водич. Питај ме било шта.' },
  { country: 'Czechia', flag: '🇨🇿', language: 'Čeština', code: 'cs', greeting: 'Ahoj! Jsem tvůj hlasový průvodce. Zeptej se mě na cokoliv.' },
  { country: 'Türkiye', flag: '🇹🇷', language: 'Türkçe', code: 'tr', greeting: 'Merhaba! Ben senin sesli rehberinim. Bana istediğini sorabilirsin.' },
  { country: 'Greece', flag: '🇬🇷', language: 'Ελληνικά', code: 'el', greeting: 'Γεια σου! Είμαι ο φωνητικός σου οδηγός. Ρώτησέ με ό,τι θέλεις.' },
  { country: 'Romania', flag: '🇷🇴', language: 'Română', code: 'ro', greeting: 'Salut! Sunt ghidul tău vocal. Întreabă-mă orice.' },
  { country: 'Hungary', flag: '🇭🇺', language: 'Magyar', code: 'hu', greeting: 'Szia! Én vagyok a hangos kalauzod. Kérdezz tőlem bármit.' },
  { country: 'Bulgaria', flag: '🇧🇬', language: 'Български', code: 'bg', greeting: 'Здравей! Аз съм твоят гласов водач. Питай ме каквото пожелаеш.' },
  { country: 'Slovakia', flag: '🇸🇰', language: 'Slovenčina', code: 'sk', greeting: 'Ahoj! Som tvoj hlasový sprievodca. Opýtaj sa ma na čokoľvek.' },
  { country: 'Wales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', language: 'Cymraeg', code: 'cy', greeting: 'Helo! Fi yw eich tywysydd llais. Gofynnwch unrhyw beth i mi.' },
  { country: 'Finland', flag: '🇫🇮', language: 'Suomi', code: 'fi', greeting: 'Hei! Olen äänioppaasi. Kysy minulta mitä tahansa.' },
  { country: 'Japan', flag: '🇯🇵', language: '日本語', code: 'ja', greeting: 'こんにちは！私はあなたの音声ガイドです。何でも聞いてください。' },
  { country: 'South Korea', flag: '🇰🇷', language: '한국어', code: 'ko', greeting: '안녕하세요! 저는 음성 가이드입니다. 무엇이든 물어보세요.' },
  { country: 'China', flag: '🇨🇳', language: '中文（普通话）', code: 'zh', greeting: '你好！我是你的语音向导。有什么问题都可以问我。' },
  { country: 'Russia', flag: '🇷🇺', language: 'Русский', code: 'ru', greeting: 'Здравствуйте! Я ваш голосовой гид. Спрашивайте меня о чём угодно.' },
  { country: 'Iran', flag: '🇮🇷', language: 'فارسی', code: 'fa', greeting: 'سلام! من راهنمای صوتی شما هستم. هر چه می‌خواهید بپرسید.' },
  { country: 'Saudi Arabia', flag: '🇸🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عن أي شيء.' },
  { country: 'Qatar', flag: '🇶🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عمّا تريد.' },
  { country: 'Morocco', flag: '🇲🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. كيف يمكنني مساعدتك؟' },
  { country: 'Egypt', flag: '🇪🇬', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عن أي شيء.' },
  { country: 'Tunisia', flag: '🇹🇳', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. تفضّل بالسؤال.' },
  { country: 'Algeria', flag: '🇩🇿', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عمّا تريد.' },
  { country: 'Senegal', flag: '🇸🇳', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Posez-moi toutes vos questions.' },
  { country: 'Ivory Coast', flag: '🇨🇮', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Comment puis-je vous aider ?' },
  { country: 'Cameroon', flag: '🇨🇲', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Que souhaitez-vous savoir ?' },
  { country: 'Nigeria', flag: '🇳🇬', language: 'English', code: 'en', greeting: 'Hello! I’m your living wiki voice guide. Ask me anything at all.' },
  { country: 'Ghana', flag: '🇬🇭', language: 'English', code: 'en', greeting: 'Hello! I’m your living wiki voice guide. How can I help you today?' },
  { country: 'South Africa', flag: '🇿🇦', language: 'English', code: 'en', greeting: 'Hi! I’m your living wiki voice guide. Ask me anything.' },
  { country: 'Kenya', flag: '🇰🇪', language: 'Kiswahili', code: 'sw', greeting: 'Habari! Mimi ni kiongozi wako wa sauti. Niulize chochote.' },
  { country: 'Australia', flag: '🇦🇺', language: 'English', code: 'en', greeting: 'G’day! I’m your living wiki voice guide. Ask me anything.' },
  { country: 'Japan (J-League)', flag: '🇯🇵', language: '日本語', code: 'ja', greeting: 'こんにちは！音声ガイドです。何でもお聞きください。' },
  { country: 'Indonesia', flag: '🇮🇩', language: 'Bahasa Indonesia', code: 'id', greeting: 'Halo! Saya pemandu suara Anda. Tanyakan apa saja.' },
  { country: 'Malaysia', flag: '🇲🇾', language: 'Bahasa Melayu', code: 'ms', greeting: 'Helo! Saya pemandu suara anda. Tanya saya apa sahaja.' },
  { country: 'Vietnam', flag: '🇻🇳', language: 'Tiếng Việt', code: 'vi', greeting: 'Xin chào! Tôi là hướng dẫn viên bằng giọng nói của bạn. Hãy hỏi tôi bất cứ điều gì.' },
  { country: 'Thailand', flag: '🇹🇭', language: 'ภาษาไทย', code: 'th', greeting: 'สวัสดี! ฉันเป็นไกด์เสียงของคุณ ถามอะไรก็ได้เลย' },
  { country: 'Philippines', flag: '🇵🇭', language: 'Filipino', code: 'tl', greeting: 'Kumusta! Ako ang iyong voice guide. Magtanong ka lang ng kahit ano.' },
  { country: 'India', flag: '🇮🇳', language: 'हिन्दी', code: 'hi', greeting: 'नमस्ते! मैं आपका वॉइस गाइड हूँ। मुझसे कुछ भी पूछिए।' },
];

const VOICE_LANGUAGES: VoiceLanguageOption[] = [
  { country: 'Argentina', flag: '🇦🇷', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. ¿En qué puedo ayudarte hoy?' },
  { country: 'Algeria', flag: '🇩🇿', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عمّا تريد.' },
  { country: 'Australia', flag: '🇦🇺', language: 'English', code: 'en', greeting: 'G’day! I’m your living wiki voice guide. Ask me anything.' },
  { country: 'Austria', flag: '🇦🇹', language: 'Deutsch', code: 'de', greeting: 'Hallo! Ich bin dein Sprachassistent. Stell mir gerne eine Frage.' },
  { country: 'Belgium', flag: '🇧🇪', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Que souhaitez-vous savoir ?' },
  { country: 'Bosnia & Herzegovina', flag: '🇧🇦', language: 'Bosanski', code: 'hr', greeting: 'Zdravo! Ja sam vaš glasovni vodič. Pitajte me bilo šta.' },
  { country: 'Brazil', flag: '🇧🇷', language: 'Português', code: 'pt-br', greeting: 'Olá! Eu sou o seu guia de voz. Pergunte o que quiser e eu respondo em voz alta.' },
  { country: 'Canada', flag: '🇨🇦', language: 'English', code: 'en', greeting: 'Hey! I’m your living wiki voice guide. What would you like to know?' },
  { country: 'Cape Verde', flag: '🇨🇻', language: 'Português', code: 'pt', greeting: 'Olá! Sou o seu guia de voz. Pergunte o que quiser.' },
  { country: 'Colombia', flag: '🇨🇴', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras.' },
  { country: 'Croatia', flag: '🇭🇷', language: 'Hrvatski', code: 'hr', greeting: 'Bok! Ja sam tvoj glasovni vodič. Pitaj me bilo što i odgovorit ću naglas.' },
  { country: 'Curaçao', flag: '🇨🇼', language: 'Nederlands', code: 'nl', greeting: 'Hallo! Ik ben je spraakgids. Stel me een vraag en ik antwoord hardop.' },
  { country: 'Czechia', flag: '🇨🇿', language: 'Čeština', code: 'cs', greeting: 'Ahoj! Jsem tvůj hlasový průvodce. Zeptej se mě na cokoliv.' },
  { country: 'DR Congo', flag: '🇨🇩', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Posez-moi toutes vos questions.' },
  { country: 'Ecuador', flag: '🇪🇨', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. ¿Cómo puedo ayudarte?' },
  { country: 'Egypt', flag: '🇪🇬', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عن أي شيء.' },
  { country: 'England', flag: '🏴', language: 'English', code: 'en', greeting: 'Hello! I’m your living wiki voice guide. Ask me anything.' },
  { country: 'France', flag: '🇫🇷', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Posez-moi vos questions, j’y réponds à voix haute.' },
  { country: 'Germany', flag: '🇩🇪', language: 'Deutsch', code: 'de', greeting: 'Hallo! Ich bin dein Sprachassistent. Stell mir eine Frage und ich antworte dir laut.' },
  { country: 'Ghana', flag: '🇬🇭', language: 'English', code: 'en', greeting: 'Hello! I’m your living wiki voice guide. How can I help you today?' },
  { country: 'Haiti', flag: '🇭🇹', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Comment puis-je vous aider ?' },
  { country: 'Iran', flag: '🇮🇷', language: 'فارسی', code: 'fa', greeting: 'سلام! من راهنمای صوتی شما هستم. هر چه می‌خواهید بپرسید.' },
  { country: 'Iraq', flag: '🇮🇶', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. كيف يمكنني مساعدتك؟' },
  { country: 'Ivory Coast', flag: '🇨🇮', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Comment puis-je vous aider ?' },
  { country: 'Japan', flag: '🇯🇵', language: '日本語', code: 'ja', greeting: 'こんにちは！私はあなたの音声ガイドです。何でも聞いてください。' },
  { country: 'Jordan', flag: '🇯🇴', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عمّا تريد.' },
  { country: 'Mexico', flag: '🇲🇽', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras y te respondo en voz alta.' },
  { country: 'Morocco', flag: '🇲🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. كيف يمكنني مساعدتك؟' },
  { country: 'Netherlands', flag: '🇳🇱', language: 'Nederlands', code: 'nl', greeting: 'Hallo! Ik ben je spraakgids. Stel me een vraag en ik antwoord hardop.' },
  { country: 'New Zealand', flag: '🇳🇿', language: 'English', code: 'en', greeting: 'Kia ora! I’m your living wiki voice guide. Ask me anything.' },
  { country: 'Norway', flag: '🇳🇴', language: 'Norsk', code: 'no', greeting: 'Hei! Jeg er din stemmeguide. Spør meg om hva som helst.' },
  { country: 'Panama', flag: '🇵🇦', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras.' },
  { country: 'Paraguay', flag: '🇵🇾', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Estoy aquí para responder tus preguntas.' },
  { country: 'Portugal', flag: '🇵🇹', language: 'Português', code: 'pt', greeting: 'Olá! Sou o seu guia de voz. Pergunte o que quiser.' },
  { country: 'Qatar', flag: '🇶🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عمّا تريد.' },
  { country: 'Saudi Arabia', flag: '🇸🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عن أي شيء.' },
  { country: 'Scotland', flag: '🏴', language: 'English', code: 'en', greeting: 'Hello! I’m your living wiki voice guide. Ask me anything.' },
  { country: 'Senegal', flag: '🇸🇳', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Posez-moi toutes vos questions.' },
  { country: 'South Africa', flag: '🇿🇦', language: 'English', code: 'en', greeting: 'Hi! I’m your living wiki voice guide. Ask me anything.' },
  { country: 'South Korea', flag: '🇰🇷', language: '한국어', code: 'ko', greeting: '안녕하세요! 저는 음성 가이드입니다. 무엇이든 물어보세요.' },
  { country: 'Spain', flag: '🇪🇸', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras.' },
  { country: 'Sweden', flag: '🇸🇪', language: 'Svenska', code: 'sv', greeting: 'Hej! Jag är din röstguide. Fråga mig vad du vill.' },
  { country: 'Switzerland', flag: '🇨🇭', language: 'Deutsch', code: 'de', greeting: 'Hallo! Ich bin dein Sprachassistent. Wie kann ich dir helfen?' },
  { country: 'Tunisia', flag: '🇹🇳', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. تفضّل بالسؤال.' },
  { country: 'Türkiye', flag: '🇹🇷', language: 'Türkçe', code: 'tr', greeting: 'Merhaba! Ben senin sesli rehberinim. Bana istediğini sorabilirsin.' },
  { country: 'Uruguay', flag: '🇺🇾', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. ¿Qué te gustaría saber?' },
  { country: 'United States', flag: '🇺🇸', language: 'English', code: 'en', greeting: 'Hi there! I’m your living wiki voice guide. Ask me anything and I’ll answer out loud.' },
  { country: 'Uzbekistan', flag: '🇺🇿', language: 'Русский', code: 'ru', greeting: 'Здравствуйте! Я ваш голосовой гид. Спрашивайте меня о чём угодно.' },
  { country: 'China', flag: '🇨🇳', language: '中文（普通话）', code: 'zh', greeting: '你好！我是你的语音向导。有什么问题都可以问我。' },
  { country: 'Russia', flag: '🇷🇺', language: 'Русский', code: 'ru', greeting: 'Здравствуйте! Я ваш голосовой гид. Спрашивайте меня о чём угодно.' },
  { country: 'India', flag: '🇮🇳', language: 'हिन्दी', code: 'hi', greeting: 'नमस्ते! मैं आपका वॉइस गाइड हूँ। मुझसे कुछ भी पूछिए।' },
];

@Component({
  selector: 'app-chat',
  imports: [FormsModule, RouterLink, ThemeToggleComponent, MobileMenuComponent, ChatLocationMapComponent],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class ChatComponent implements AfterViewChecked, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly atlasService = inject(AtlasService);
  private readonly answerCardService = inject(AnswerCardService);
  private readonly answerQuizService = inject(AnswerQuizService);
  private readonly chatService = inject(ChatService);
  private readonly documentsService = inject(DocumentsService);
  private readonly wikiService = inject(WikiService);
  private readonly placeReviewsService = inject(PlaceReviewsService);
  private readonly route = inject(ActivatedRoute);

  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);
  readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );

  private shouldScrollToEnd = false;
  private thinkingInterval: ReturnType<typeof setInterval> | null = null;
  private copyFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;
  private answerAudio: HTMLAudioElement | null = null;
  private answerAudioUrls = new Map<string, string>();
  private answerAudioPromises = new Map<string, Promise<string | null>>();
  private voiceClickScrollPosition: ReturnType<ChatComponent['captureScrollPosition']> = null;
  private voiceScrollLockTimer: ReturnType<typeof setInterval> | null = null;
  private realtimeVoiceConversation: ElevenLabsConversation | null = null;
  private realtimeVoiceEndingByUser = false;
  private realtimeVoiceSummaryOffered = false;
  private pendingVoiceLanguagePrompt: string | null = null;
  private realtimeVoiceMeterFrame: number | null = null;

  readonly isSigningOut = signal(false);
  readonly isDeletingHistory = signal(false);
  readonly isSharingThread = signal(false);
  readonly shareModalOpen = signal(false);
  readonly shareModalError = signal<string | null>(null);
  readonly generatedShareLink = signal<string | null>(null);
  readonly subscribeModalOpen = signal(false);
  readonly subscribeEmail = signal('');
  readonly isSubscribing = signal(false);
  readonly subscribeError = signal<string | null>(null);
  readonly subscribeSuccess = signal<string | null>(null);
  readonly avatarMenuOpen = signal(false);
  readonly answerMode = signal<'wiki' | 'internet'>('wiki');
  readonly question = signal('');
  readonly selectedCitation = signal<CitationPassage | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly thinkingStage = signal(0);
  readonly historyExpanded = signal(false);
  readonly activeHistoryId = signal<string | null>(null);
  readonly activeThreadId = signal<string | null>(null);
  readonly messageActionMenuId = signal<string | null>(null);
  readonly creatingAnswerCardId = signal<string | null>(null);
  readonly creatingQuizId = signal<string | null>(null);
  readonly answerCardLinks = signal<Record<string, string>>({});
  readonly quizLinks = signal<Record<string, string>>({});
  readonly answerCardErrorMessageId = signal<string | null>(null);
  readonly answerCardError = signal<string | null>(null);
  readonly loadingSpeechMessageId = signal<string | null>(null);
  readonly playingSpeechMessageId = signal<string | null>(null);
  readonly preparedSpeechMessageIds = signal<Record<string, boolean>>({});
  readonly speechErrorMessageId = signal<string | null>(null);
  readonly speechError = signal<string | null>(null);
  readonly realtimeVoicePanelOpen = signal(false);
  readonly realtimeVoiceStatus = signal<RealtimeVoiceStatus>('disconnected');
  readonly realtimeVoiceMode = signal<ElevenLabsMode | null>(null);
  readonly realtimeVoiceMuted = signal(false);
  readonly realtimeVoiceError = signal<string | null>(null);
  readonly realtimeVoiceConversationId = signal<string | null>(null);
  readonly realtimeVoiceTranscript = signal<VoiceTranscriptItem[]>([]);
  readonly realtimeVoiceTextInput = signal('');
  readonly realtimeVoiceInputLevel = signal(0);
  readonly realtimeVoiceOutputLevel = signal(0);
  readonly realtimeVoiceEnergyLevel = signal(0);
  readonly realtimeVoiceVisualScale = computed(() => (1 + this.realtimeVoiceEnergyLevel() * 0.12).toFixed(3));
  readonly realtimeVoiceVisualGlow = computed(() => `${Math.round(22 + this.realtimeVoiceEnergyLevel() * 70)}px`);
  readonly realtimeVoiceVisualBar = computed(() => (0.2 + this.realtimeVoiceEnergyLevel() * 1.7).toFixed(3));
  readonly voiceSummaryModal = signal<VoiceSummaryModal | null>(null);
  readonly voiceSummaryEmail = signal('');
  readonly voiceSummarySending = signal(false);
  readonly voiceSummaryError = signal<string | null>(null);
  readonly voiceSummarySent = signal(false);

  // Language flag carousel (World Cup 2026 nations + China / Russia / India).
  readonly voiceLanguages = signal<VoiceLanguageOption[]>(VOICE_LANGUAGES);
  readonly voiceLanguageSearch = signal('');
  readonly filteredVoiceLanguages = computed(() => {
    const query = this.voiceLanguageSearch().trim().toLowerCase();
    if (!query) {
      return this.voiceLanguages();
    }
    const normalizedQuery = normalizeVoiceSearchText(query);
    return this.voiceLanguages().filter((language) => [
      language.country,
      language.language,
      language.code,
      ...(VOICE_LANGUAGE_SEARCH_ALIASES[language.code] ?? []),
      ...(language.searchTerms ?? []),
    ].map(normalizeVoiceSearchText).join(' ').includes(normalizedQuery));
  });
  readonly voiceCarouselAtStart = signal(true);
  readonly voiceCarouselAtEnd = signal(false);
  readonly selectedVoiceLanguage = signal<VoiceLanguageOption | null>(null);
  readonly selectedVoiceLanguageGreeting = computed(() => {
    const language = this.selectedVoiceLanguage();
    return language
      ? this.voiceSessionGreeting(language)
      : `Choose a flag to switch ${this.currentWikiName() || 'this City Wiki'} into your language.`;
  });
  readonly selectedVoiceLanguageCta = computed(() => {
    const language = this.selectedVoiceLanguage();
    return language ? `Speak to me in ${language.language}` : 'Select a flag first';
  });
  // Language the active/last voice session was started in, so the UI can show
  // which flag is "speaking".
  readonly activeVoiceLanguageCode = signal<VoiceLanguageCode | null>(null);
  readonly activeVoiceCountry = signal<string | null>(null);
  readonly pendingDeleteHistoryItem = signal<ChatHistoryItem | null>(null);
  readonly copiedTarget = signal<string | null>(null);
  readonly savedTravelCardIds = signal<Record<string, boolean>>(this.loadSavedTravelCardIds());
  readonly sharingTravelCardId = signal<string | null>(null);
  readonly sharePageModal = signal<SharePageModal | null>(null);
  readonly publicAtlas = signal<AtlasItem | null>(null);
  readonly publicLookupDone = signal(false);
  readonly publicChatLoading = signal(false);
  readonly publicLoadError = signal<string | null>(null);
  readonly publicQuestionLimit = signal<number | null>(null);
  readonly publicRemainingQuestions = signal<number | null>(null);
  readonly publicRequiresSignIn = signal(false);
  readonly publicDocumentCount = signal(0);
  readonly publicCityWikis = signal<PublicWikiCatalogItem[]>(
    COMING_SOON_PUBLIC_WIKIS.filter((wiki) => wiki.category === CITY_WIKI_CATEGORY),
  );
  readonly anonymousVisitorId = signal<string | null>(this.loadAnonymousVisitorId());
  readonly heroTypedPrompt = signal('');
  readonly animatedDocumentCount = signal(0);
  readonly animatedArticleCount = signal(0);
  readonly animatedSourceCount = signal(0);
  readonly reviewedPlaces = signal<CityReviewedPlace[]>([]);
  readonly reviewedPlacesLoading = signal(false);
  readonly isPublicView = computed(() => !!this.routeSlug());
  readonly publicNotFound = computed(
    () => this.isPublicView() && this.publicLookupDone() && !this.publicAtlas(),
  );
  readonly authInitialized = this.authService.initialized;
  readonly isSignedIn = computed(() => !!this.authService.uid());
  readonly isPublicOwner = computed(
    () => this.isPublicView() && !!this.publicAtlas() && this.publicAtlas()!.user_id === this.authService.uid(),
  );
  readonly hidePublicSourceFiles = computed(() => this.isPublicView() && !this.isPublicOwner());
  readonly hidePublicKnowledgeSurfaces = computed(() =>
    this.atlasService.isPublicCityVisitorAtlas(this.publicAtlas(), this.authService.uid()),
  );
  readonly isWorkspaceMode = computed(() => !this.isPublicView() || this.isPublicOwner());
  readonly isInternetMode = computed(() => this.answerMode() === 'internet');
  readonly isPublicVisitorMode = computed(() => this.isPublicView() && !this.isPublicOwner());
  readonly canUseAnswerModeToggle = computed(() =>
    (this.isWorkspaceMode() || this.isPublicVisitorMode()) && this.hasWikiDocuments(),
  );
  readonly canStartFreshChat = computed(
    () => !this.publicNotFound() && (this.isWorkspaceMode() || this.isPublicVisitorMode()),
  );
  readonly canStartRealtimeVoice = computed(
    () => !this.publicNotFound() && !this.isPublicPageLoading() && !!this.currentVoiceAtlasId(),
  );
  readonly canShowCityVoiceCarousel = computed(
    () => this.canStartRealtimeVoice() && this.currentWikiAtlas()?.city_config?.enabled === true,
  );
  readonly realtimeVoiceActive = computed(() => {
    const status = this.realtimeVoiceStatus();
    return status === 'connecting' || status === 'connected' || status === 'disconnecting';
  });
  readonly realtimeVoiceOrbState = computed(() => {
    if (this.realtimeVoiceStatus() === 'connecting') return 'Connecting';
    if (this.realtimeVoiceStatus() === 'error') return 'Needs attention';
    if (this.realtimeVoiceStatus() === 'disconnected') return 'Ready';
    return this.realtimeVoiceMode() === 'speaking' ? 'Speaking' : 'Listening';
  });
  readonly realtimeVoicePrimaryLabel = computed(() => {
    const status = this.realtimeVoiceStatus();
    if (status === 'connecting') return 'Connecting';
    if (status === 'disconnecting') return 'Ending';
    if (status === 'connected') return 'End voice';
    return 'Voice mode';
  });
  readonly realtimeVoicePanelTitle = computed(() => {
    const status = this.realtimeVoiceStatus();
    if (status === 'connecting') return 'Connecting realtime voice';
    if (status === 'connected') {
      return this.realtimeVoiceMode() === 'speaking' ? 'AI speaking' : 'Listening';
    }
    if (status === 'disconnecting') return 'Ending voice mode';
    if (status === 'error') return 'Voice mode needs setup';
    return 'Realtime voice is ready';
  });
  readonly realtimeVoiceGreeting = computed(() =>
    this.voiceSessionGreeting(),
  );

  readonly canScrollVoiceCarouselPrev = computed(() => !this.voiceCarouselAtStart());
  readonly canScrollVoiceCarouselNext = computed(() => !this.voiceCarouselAtEnd());

  readonly isAnonymousPublicVisitor = computed(() => this.isPublicVisitorMode() && !this.isSignedIn());
  readonly isSignedInPublicVisitor = computed(() => this.isPublicVisitorMode() && this.isSignedIn());
  readonly isPublicPageLoading = computed(() => {
    if (!this.isPublicView()) {
      return false;
    }
    if (!this.publicLookupDone()) {
      return true;
    }
	    if (this.publicNotFound()) {
	      return false;
	    }
	    return false;
	  });

  @ViewChild('transcriptEnd') transcriptEnd?: ElementRef<HTMLElement>;
  @ViewChild('composerInput') composerInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('chatScrollViewport') chatScrollViewport?: ElementRef<HTMLElement>;
  @ViewChild('voiceLanguageTrack') voiceLanguageTrack?: ElementRef<HTMLElement>;

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly isPlatformAdmin = this.authService.isAdmin;
  readonly atlasHomeLink = computed(() => this.publicRoute('atlas') ?? this.atlasService.activeAtlasHomeLink());
  readonly atlasWikiLink = computed(() => this.publicRoute('wiki') ?? this.atlasService.activeAtlasWikiLink());
  readonly chatLink = computed(() => this.publicRoute('chat') ?? '/chat');
  readonly uploadLink = computed(() => this.publicRoute('upload') ?? '/upload');
  readonly libraryLink = computed(() => this.publicRoute('library') ?? '/library');
  readonly queryHistory = this.chatService.queryHistory;
  readonly isSubmitting = this.chatService.isSubmitting;
  readonly submitError = this.chatService.submitError;

  readonly visibleHistory = computed(() => {
    const all = this.queryHistory();
    return this.historyExpanded() ? all : all.slice(0, 6);
  });
  readonly sidebarCityWikis = computed(() => {
    const currentSlug = (this.routeSlug() ?? this.currentWikiAtlas()?.slug ?? '').trim().toLowerCase();
    return this.publicCityWikis()
      .filter((wiki) => (wiki.slug ?? '').trim().toLowerCase() !== currentSlug)
      .slice(0, 1);
  });
  readonly activeThreadHistoryItem = computed<ChatThreadItem | null>(() => {
    const activeThreadId = this.activeThreadId();
    if (!activeThreadId) {
      return null;
    }

    const item = this.queryHistory().find(
      (entry): entry is ChatThreadItem => entry.kind === 'thread' && entry.id === activeThreadId,
    );
    return item ?? null;
  });
  readonly canShareActiveThread = computed(() => this.isWorkspaceMode() && !!this.activeThreadId() && this.hasMessages());
  readonly activeThreadIsShared = computed(() => this.activeThreadHistoryItem()?.is_shared === true);

  readonly hasMessages = computed(() => this.messages().length > 0);
  readonly currentThinkingLabel = computed(() => THINKING_STAGES[this.thinkingStage()] ?? THINKING_STAGES[0]);
  readonly pageTitle = computed(() =>
    this.isPublicView() ? `${this.atlasService.displayName(this.publicAtlas())} Chat` : 'Chat',
  );
  readonly pageSubtitle = computed(() => {
    if (this.isWorkspaceMode()) {
      return '';
    }
    if (this.showSignInCta()) {
      return 'Public question limit reached';
    }
    if (this.isAnonymousPublicVisitor()) {
      return 'Ask up to 5 questions without signing in';
    }
    if (this.isSignedInPublicVisitor()) {
      return 'Signed-in visitors can chat freely with this atlas';
    }
    return 'Ask questions about this public atlas';
  });
  readonly composerPlaceholder = computed(() =>
    this.canUseAnswerModeToggle()
      ? this.isInternetMode()
        ? this.localInternetPlaceholder()
        : 'Message My living wiki...'
      : this.showSignInCta()
        ? 'Sign in to continue asking questions...'
        : this.localInternetPlaceholder(),
  );
  readonly canSubmit = computed(() => {
    if (this.isSubmitting() || !this.question().trim() || this.publicNotFound()) {
      return false;
    }
    if (this.isWorkspaceMode()) {
      return true;
    }
    return this.authInitialized() && !this.isPublicPageLoading() && !this.publicRequiresSignIn();
  });
  readonly showSignInCta = computed(() => this.isAnonymousPublicVisitor() && this.publicRequiresSignIn());
  readonly primaryActionDisabled = computed(() => (this.showSignInCta() ? false : !this.canSubmit()));
  readonly publicSidebarNotice = computed(() => {
    if (!this.isPublicVisitorMode()) {
      return '';
    }
    if (this.showSignInCta()) {
      return 'You have reached the 5-question public limit. Sign in to continue this conversation.';
    }
    if (this.isAnonymousPublicVisitor()) {
      const remaining = this.publicRemainingQuestions();
      return remaining === null
        ? 'Ask up to 5 questions without signing in.'
        : `Ask up to 5 questions without signing in. ${remaining} remaining.`;
    }
    return 'Subscribe for weekly updates from this Wiki.';
  });
  readonly currentWikiAtlas = computed(() =>
    this.isPublicView() ? this.publicAtlas() : this.atlasService.activeAtlas(),
  );
  readonly currentVoiceAtlasId = computed(() =>
    this.currentWikiAtlas()?.id ?? this.publicAtlas()?.id ?? this.atlasService.activeAtlasId(),
  );
  readonly canAdminCurrentWiki = computed(() => this.atlasService.canAdminAtlas(this.currentWikiAtlas()));
  readonly canSubscribeToCurrentWiki = computed(() => {
    const atlas = this.currentWikiAtlas();
    return !!atlas?.id && atlas.is_public === true && !this.canAdminCurrentWiki();
  });
  readonly canSubmitSubscribeEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.subscribeEmail().trim().toLowerCase()));
  readonly currentWikiAdminLink = computed(() => {
    const atlas = this.currentWikiAtlas();
    return atlas && this.canAdminCurrentWiki() ? '/atlases' : null;
  });
  readonly currentWikiName = computed(() => {
    const atlas = this.currentWikiAtlas();
    if (!atlas) {
      return '';
    }
    const name = this.atlasService.displayName(atlas);
    if (!name || name === 'Select atlas') {
      return '';
    }
    return name.replace(/^My living wiki:\s*/i, '').replace(/\s*\(flagship\)\s*$/i, '').trim();
  });
  readonly currentWikiCountry = computed(() => this.atlasService.cityCountryLabel(this.currentWikiAtlas()) ?? '');
  readonly canShowPlaceReviews = computed(() => {
    const atlas = this.currentWikiAtlas();
    return !!atlas?.id && atlas.city_config?.enabled === true && !this.publicNotFound();
  });
  readonly reviewedPlacesCountLabel = computed(() => {
    const count = this.reviewedPlaces().length;
    return count === 1 ? '1 reviewed place' : `${count} reviewed places`;
  });
  readonly reviewedPlacesPreview = computed(() => this.reviewedPlaces().slice(0, 4));
  readonly placesLink = computed(() => {
    const slug = this.currentWikiAtlas()?.slug?.trim() || this.routeSlug()?.trim();
    return slug ? ['/places', slug] : '/public-wikis';
  });
  readonly currentWikiVoicePhoneNumber = computed(() => this.currentWikiAtlas()?.public_voice_phone_number?.trim() || '');
  readonly currentWikiVoicePhoneHref = computed(() => {
    const phone = this.currentWikiVoicePhoneNumber();
    const digits = phone.replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : '';
  });
  readonly revealJoinPhoneNumber = computed(() => !!this.currentWikiVoicePhoneNumber() && (!!this.subscribeSuccess() || this.isSignedIn()));
  readonly currentWikiGuide = computed(() => {
    const guide = this.currentWikiAtlas()?.chat_guide;
    const hasGuide = !!guide?.name?.trim() || !!guide?.label?.trim() || !!guide?.image_url?.trim() || !!guide?.banner_url?.trim();
    return hasGuide ? guide : null;
  });
  readonly currentWikiDocumentCount = computed(() =>
    this.isPublicView()
      ? this.publicDocumentCount()
      : this.documentsService.stats().totalDocuments,
  );
  readonly hasWikiDocuments = computed(() => this.currentWikiDocumentCount() > 0);
  readonly currentWikiArticleCount = computed(() => this.wikiService.articles().length);
  readonly currentWikiSourceCount = computed(() => this.currentWikiDocumentCount() + this.currentWikiArticleCount());
  readonly currentWikiSummary = computed(() => {
    const atlas = this.currentWikiAtlas();
    const description = atlas?.description?.trim();
    if (description) {
      return description;
    }
    const name = this.currentWikiName();
    return name ? `Ask ${name} anything from your sources.` : 'Ask anything from your sources.';
  });
  readonly emptyStateEyebrow = computed(() => {
    if (this.canUseAnswerModeToggle()) {
      return this.isInternetMode() ? 'Internet mode' : 'My living wiki';
    }
    return 'Internet mode';
  });
  readonly emptyStateTitle = computed(() => {
    const name = this.currentWikiName();
    if (this.isWorkspaceMode()) {
      return name ? `Ask ${name}` : 'Ask your Wiki';
    }
    if (this.showSignInCta()) {
      return 'Sign in to keep chatting';
    }
    return name ? `Ask ${name}` : 'Ask this Wiki';
  });
  readonly emptyStateDescription = computed(() => {
    if (this.canUseAnswerModeToggle()) {
      return this.isInternetMode()
        ? 'Internet mode uses general web knowledge and current public sources, not just your uploaded material.'
        : this.currentWikiSummary();
    }
    if (!this.hasWikiDocuments()) {
      return 'No source documents are attached yet, so answers use internet context and current public sources.';
    }
    if (this.showSignInCta()) {
      return 'You have used all 5 anonymous public questions for this atlas. Sign in to continue.';
    }
    if (this.isAnonymousPublicVisitor()) {
      const remaining = this.publicRemainingQuestions();
      const base = this.currentWikiSummary();
      const limitNote = remaining === null
        ? '5 anonymous questions allowed.'
        : `${remaining} anonymous question${remaining === 1 ? '' : 's'} left.`;
      return `${base} ${limitNote}`;
    }
    return this.currentWikiSummary();
  });
  readonly heroPromptText = computed(() => {
    if (this.showSignInCta()) {
      return 'Sign in to continue asking grounded questions.';
    }

    if (!this.hasWikiDocuments() || (this.canUseAnswerModeToggle() && this.isInternetMode())) {
      return 'Ask anything with full internet context and live public sources.';
    }

    const name = this.currentWikiName();
    if (name) {
      return `Ask ${name} anything from your sources.`;
    }

    return 'Ask your living wiki anything from your sources.';
  });
  readonly heroSupportingText = computed(() => {
    if (this.showSignInCta()) {
      return 'You have used the anonymous question limit for this atlas. Sign in to keep the conversation going.';
    }

    if (!this.hasWikiDocuments() || (this.canUseAnswerModeToggle() && this.isInternetMode())) {
      return 'Internet mode is not limited to your documents. It uses public web sources and broader general knowledge.';
    }

    const name = this.currentWikiName();
    if (name) {
      return `${name} is indexed into documents and wiki pages so every answer can stay grounded in the material you uploaded.`;
    }

    return 'Your documents and wiki pages are indexed so every answer can stay grounded in the material you uploaded.';
  });
  readonly heroStatusLabel = computed(() => (this.isPublicVisitorMode() ? 'Public atlas live' : 'My living wiki live'));
  readonly heroMetaLabel = computed(() => {
    if (this.hidePublicKnowledgeSurfaces()) {
      return 'Knowledge ready';
    }

    if (this.showSignInCta()) {
      return 'Anonymous session paused';
    }

    if (!this.hasWikiDocuments() || (this.canUseAnswerModeToggle() && this.isInternetMode())) {
      return 'Internet mode enabled';
    }

    const total = this.currentWikiSourceCount();
    return total === 1 ? '1 indexed source ready' : `${total} indexed sources ready`;
  });
  readonly composerHelperText = computed(() => {
    if (!this.hasWikiDocuments()) {
      return 'Internet mode searches the web because this Wiki does not have source documents yet.';
    }

    if (this.canUseAnswerModeToggle()) {
      return this.isInternetMode()
        ? 'Internet mode searches the web and answers beyond your uploaded sources.'
        : 'My living wiki mode stays grounded in your indexed documents and wiki pages.';
    }
    if (this.showSignInCta()) {
      return 'You have used all 5 anonymous questions. Sign in to continue.';
    }
    if (this.isAnonymousPublicVisitor()) {
      const remaining = this.publicRemainingQuestions();
      return remaining === null
        ? 'Ask up to 5 questions without signing in.'
        : `${remaining} of 5 anonymous questions remaining.`;
    }
    return 'Your questions are saved with your name and email for the atlas owner.';
  });

  private cachedPromptsKey: string | null = null;
  private cachedPrompts: PromptSuggestion[] = [];

  readonly quickPrompts = computed<PromptSuggestion[]>(() => {
    if (this.publicNotFound()) {
      return [];
    }

    const atlasName = this.currentWikiName() || 'this atlas';
    if (this.isInternetMode()) {
      return [
        {
          title: 'Latest updates',
          prompt: `What are the latest updates about ${atlasName}?`,
          detail: 'Search the web for what is current right now.',
          icon: 'public',
        },
        {
          title: 'What matters now',
          prompt: `What should I know right now about ${atlasName}?`,
          detail: 'Get a quick current-events briefing.',
          icon: 'bolt',
        },
        {
          title: 'Recent debates',
          prompt: `What are people debating about ${atlasName} right now?`,
          detail: 'Pull in live internet context and discussion themes.',
          icon: 'forum',
        },
        {
          title: 'Background context',
          prompt: `Give me background context on ${atlasName} from public sources.`,
          detail: 'Pull broader context from the open web.',
          icon: 'travel_explore',
        },
      ];
    }

    const topics = this.wikiService.topics();
    const articles = this.wikiService.articles();
    const atlasId = this.isPublicView()
      ? this.publicAtlas()?.id ?? this.routeSlug() ?? ''
      : this.atlasService.activeAtlasId() ?? '';
    const cacheKey = `${atlasId}::${topics.length}::${articles.length}`;
    if (this.cachedPromptsKey === cacheKey && this.cachedPrompts.length > 0) {
      return this.cachedPrompts;
    }

    const candidates: string[] = [];
    for (const topic of topics) {
      const name = topic.name?.trim();
      if (name) candidates.push(name);
    }
    for (const article of articles) {
      const title = article.title?.trim();
      if (title) candidates.push(title);
    }

    const uniqueCandidates = Array.from(
      new Set(candidates.map((candidate) => candidate.replace(/\s+/g, ' ').trim()).filter(Boolean)),
    );

    const picks = uniqueCandidates.slice(0, 4);

    const built = picks.length > 0
      ? picks.map((label, i) => ({
          title: label,
          prompt: [
            `What is ${label}?`,
            `Why does ${label} matter?`,
            `Give me the key facts about ${label}.`,
            `How does ${label} connect to ${atlasName}?`,
          ][i % 4],
          detail: i % 2 === 0 ? 'Grounded in the wiki and its sources.' : 'Use the atlas knowledge base for context.',
          icon: i % 2 === 0 ? 'auto_stories' : 'explore',
        }))
      : [
          {
            title: 'Quick overview',
            prompt: `Give me a quick overview of ${atlasName}.`,
            detail: 'Start with the highest-signal summary from the wiki.',
            icon: 'dashboard',
          },
          {
            title: 'Important topics',
            prompt: `What are the most important topics in ${atlasName}?`,
            detail: 'See the main themes already covered in this wiki.',
            icon: 'menu_book',
          },
          {
            title: 'Best starting point',
            prompt: `What should I read first about ${atlasName}?`,
            detail: 'Ask the wiki where a new reader should begin.',
            icon: 'flag',
          },
          {
            title: 'Key questions',
            prompt: `What are the key open questions about ${atlasName}?`,
            detail: 'Surface the unresolved or most-discussed questions.',
            icon: 'help',
          },
        ];

    this.cachedPromptsKey = cacheKey;
    this.cachedPrompts = built;
    return built;
  });

  readonly userInitials = () => {
    const name = this.currentUserName();
    if (!name) return '?';
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  };

  cityWikiRouterLink(wiki: PublicWikiCatalogItem): string | string[] {
    return wiki.status === 'live' && wiki.slug ? ['/chat', wiki.slug] : '/public-wikis';
  }

  cityWikiStatusLabel(wiki: PublicWikiCatalogItem): string {
    return wiki.status === 'live' ? 'Live' : 'Preview';
  }

  cityWikiLocationLabel(wiki: PublicWikiCatalogItem): string {
    return wiki.title.replace(/^My living wiki:\s*/i, '').trim();
  }

  private localInternetPlaceholder(): string {
    const name = this.currentWikiName();
    if (!name) {
      return 'Ask about news, places, jobs, events, and civic life...';
    }
    return `Ask about ${name} news, neighborhoods, transit, food, jobs, safety, events, and civic life...`;
  }

  placeRatingLabel(place: CityReviewedPlace): string {
    const rating = place.ratingAvg ?? 0;
    const count = place.reviewCount ?? place.ratingCount ?? 0;
    if (!rating) {
      return count ? `${count} ratings` : 'New';
    }
    return count ? `${rating.toFixed(1)} · ${count}` : rating.toFixed(1);
  }

  placeReviewCountLabel(place: CityReviewedPlace): string {
    const count = place.reviewCount ?? place.ratingCount ?? 0;
    if (!count) {
      return 'No local reviews yet';
    }
    return count === 1 ? '1 local review' : `${count} local reviews`;
  }

  placeDetailQueryParams(place: CityReviewedPlace): { place: string } {
    return { place: place.id || place.placeId };
  }

  placeInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || 'P';
  }

  truncatePlaceText(value: string | undefined | null, max = 96): string {
    const text = (value ?? '').trim();
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, max - 1).trim()}...`;
  }

  constructor() {
    void this.loadSidebarCityWikis();

    effect((onCleanup) => {
      const slug = this.routeSlug();
      if (!slug) {
        this.publicAtlas.set(null);
        this.publicLookupDone.set(true);
        this.publicChatLoading.set(false);
        this.publicLoadError.set(null);
        this.publicDocumentCount.set(0);
        return;
      }

      this.publicAtlas.set(null);
      this.publicLookupDone.set(false);
      this.publicLoadError.set(null);
      this.messages.set([]);
      this.syncArtifactLinksFromMessages([]);
      this.activeThreadId.set(null);
      this.activeHistoryId.set(null);
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      void this.atlasService
        .getPublicAtlasBySlug(slug)
        .then((atlas) => {
          if (!cancelled) {
            this.publicAtlas.set(atlas);
          }
        })
        .catch(() => {
          if (!cancelled) {
            this.publicAtlas.set(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            this.publicLookupDone.set(true);
          }
        });
    });

    effect((onCleanup) => {
      const atlasId = this.isPublicView() ? this.publicAtlas()?.id ?? null : null;
      let cancelled = false;

      this.wikiService.setPublicAtlasId(atlasId);

      if (!atlasId) {
        this.publicDocumentCount.set(0);
        return;
      }

      void this.documentsService
        .getPublicAtlasDocuments(atlasId)
        .then((documents) => {
          if (!cancelled) {
            this.publicDocumentCount.set(documents.length);
          }
        })
        .catch(() => {
          if (!cancelled) {
            this.publicDocumentCount.set(0);
          }
        });

      onCleanup(() => {
        cancelled = true;
      });
    });

    effect((onCleanup) => {
      const atlasId = this.currentWikiAtlas()?.id ?? null;
      let cancelled = false;

      if (!atlasId || !this.canShowPlaceReviews()) {
        this.reviewedPlaces.set([]);
        this.reviewedPlacesLoading.set(false);
        return;
      }

      this.reviewedPlacesLoading.set(true);
      void this.placeReviewsService
        .listCityReviewedPlaces(atlasId)
        .then((places) => {
          if (!cancelled) {
            this.reviewedPlaces.set(places);
          }
        })
        .catch(() => {
          if (!cancelled) {
            this.reviewedPlaces.set([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            this.reviewedPlacesLoading.set(false);
          }
        });

      onCleanup(() => {
        cancelled = true;
      });
    });

    effect(() => {
      if (!this.isPublicView()) {
        return;
      }

      const atlas = this.publicAtlas();
      if (atlas?.id && this.atlasService.canAdminAtlas(atlas)) {
        this.atlasService.setActive(atlas.id);
      }
    });

    effect(() => {
      const atlas = this.currentWikiAtlas();
      const canUseToggle = this.canUseAnswerModeToggle();
      const hasActiveConversation = !!this.activeThreadId() || this.messages().length > 0;
      if (!atlas?.id || hasActiveConversation) {
        return;
      }

      if (!canUseToggle) {
        this.answerMode.set('internet');
        return;
      }

      this.answerMode.set(this.defaultAnswerMode(atlas));
    });

    effect(() => {
      if (!this.isPublicView()) {
        this.resetPublicChatState();
        return;
      }

      if (!this.publicLookupDone()) {
        this.publicChatLoading.set(true);
        this.publicLoadError.set(null);
        return;
      }

      if (this.publicNotFound()) {
        this.resetPublicChatState();
        this.messages.set([]);
        this.syncArtifactLinksFromMessages([]);
        this.activeThreadId.set(null);
        return;
      }

      if (!this.authInitialized()) {
        this.publicChatLoading.set(true);
        this.publicLoadError.set(null);
        return;
      }

      if (this.isWorkspaceMode()) {
        this.resetPublicChatState();
        this.messages.set([]);
        this.syncArtifactLinksFromMessages([]);
        this.activeThreadId.set(null);
        this.activeHistoryId.set(null);
        return;
      }

      const atlas = this.publicAtlas();
      if (!atlas?.id) {
        this.resetPublicChatState();
        return;
      }

      this.publicChatLoading.set(false);
      this.publicLoadError.set(null);
      this.messages.set([]);
      this.syncArtifactLinksFromMessages([]);
      this.activeThreadId.set(null);
      this.activeHistoryId.set(null);
      this.publicQuestionLimit.set(this.isAnonymousPublicVisitor() ? 5 : null);
      this.publicRemainingQuestions.set(this.isAnonymousPublicVisitor() ? 5 : null);
      this.publicRequiresSignIn.set(false);
    });

    effect((onCleanup) => {
      const text = this.heroPromptText();
      const shouldAnimate = !this.hasMessages() && !this.isPublicPageLoading() && !this.publicNotFound();

      if (!text) {
        this.heroTypedPrompt.set('');
        return;
      }

      if (!shouldAnimate) {
        this.heroTypedPrompt.set(text);
        return;
      }

      this.heroTypedPrompt.set('');
      let index = 0;
      const interval = setInterval(() => {
        index = Math.min(index + 1, text.length);
        this.heroTypedPrompt.set(text.slice(0, index));
        if (index >= text.length) {
          clearInterval(interval);
        }
      }, text.length > 54 ? 24 : 34);

      onCleanup(() => clearInterval(interval));
    });

    effect((onCleanup) => {
      const shouldAnimate = !this.hasMessages() && !this.isPublicPageLoading() && !this.publicNotFound();
      const docs = this.currentWikiDocumentCount();
      const articles = this.currentWikiArticleCount();
      const sources = this.currentWikiSourceCount();

      if (!shouldAnimate) {
        this.animatedDocumentCount.set(docs);
        this.animatedArticleCount.set(articles);
        this.animatedSourceCount.set(sources);
        return;
      }

      const startedAt = Date.now();
      const durationMs = 900;
      const interval = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);

        this.animatedDocumentCount.set(Math.round(docs * eased));
        this.animatedArticleCount.set(Math.round(articles * eased));
        this.animatedSourceCount.set(Math.round(sources * eased));

        if (progress >= 1) {
          clearInterval(interval);
        }
      }, 32);

      onCleanup(() => clearInterval(interval));
    });
  }

  async submitQuestion(): Promise<void> {
    const question = this.question().trim();
    if (!question || this.isSubmitting() || this.publicNotFound()) {
      return;
    }

    const submittedThreadId = this.activeThreadId();
    const shouldStartNewPublicThread = !this.isWorkspaceMode() && !submittedThreadId;
    if (!submittedThreadId && this.isWorkspaceMode()) {
      this.activeHistoryId.set(null);
    }
    this.question.set('');
    queueMicrotask(() => this.autoGrowComposer());
    const selectedAnswerMode = this.canUseAnswerModeToggle() ? this.answerMode() : 'internet';

    const now = new Date();
    const userId = `u-${Date.now()}`;
    const pendingId = `a-${Date.now()}`;
    this.messages.update((msgs) => [
      ...msgs,
      { id: userId, role: 'user', text: question, answerMode: selectedAnswerMode, createdAt: now, updatedAt: now },
      { id: pendingId, role: 'assistant', text: '', answerMode: selectedAnswerMode, pending: true, createdAt: now, updatedAt: now },
    ]);
    this.shouldScrollToEnd = true;
    this.startThinkingRotation();

    let streamStarted = false;
    const response = this.isWorkspaceMode()
      ? selectedAnswerMode === 'internet'
        ? await this.chatService.askInternetStream(question, submittedThreadId, {
            onDelta: (delta) => {
              if (!streamStarted) {
                streamStarted = true;
                this.stopThinkingRotation();
              }
              this.messages.update((msgs) =>
                msgs.map((message) => {
                  if (message.id !== pendingId) {
                    return message;
                  }
                  const text = `${message.text ?? ''}${delta}`;
                  return {
                    ...message,
                    text,
                    html: formatAssistantMessageHtml(text),
                    updatedAt: new Date(),
                  };
                }),
              );
              this.shouldScrollToEnd = true;
            },
          })
        : await this.chatService.ask(question, undefined, submittedThreadId)
      : await this.chatService.askPublic(question, this.publicAtlas()!.id, {
          threadId: submittedThreadId,
          anonymousVisitorId: this.isAnonymousPublicVisitor() ? this.ensureAnonymousVisitorId() : null,
          answerMode: selectedAnswerMode,
          startNewThread: shouldStartNewPublicThread,
        });

    this.stopThinkingRotation();

    const err = this.submitError();
    if (err) {
      this.messages.update((msgs) =>
        msgs.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                pending: false,
                text: err,
                html: formatAssistantMessageHtml(err),
                answerMode: selectedAnswerMode,
                updatedAt: new Date(),
              }
            : message,
        ),
      );
    } else {
      const publicResponse =
        !this.isWorkspaceMode() && response && 'blocked' in response ? response : null;
      const blocked = publicResponse?.blocked === true;
      const answer = blocked
        ? 'You have reached the 5-question public limit for this atlas. Sign in to continue this conversation.'
        : response?.answer ?? this.chatService.latestAnswer() ?? '';
      const citations = this.normalizeCitations(response?.citedPassages ?? this.chatService.latestCitations());
      const mappableLocations = this.normalizeMappableLocations(response?.mappableLocations ?? []);
      const travelGuide = this.normalizeTravelGuide(response?.travelGuide ?? null);
      const gap = response?.knowledgeGap ?? this.chatService.knowledgeGap();
      const returnedThreadId = response?.threadId ?? submittedThreadId;

      if (returnedThreadId && submittedThreadId && returnedThreadId !== submittedThreadId) {
        this.messages.set([
          { id: userId, role: 'user', text: question, createdAt: now, updatedAt: now },
          {
            id: pendingId,
            role: 'assistant',
            text: answer,
            html: formatAssistantMessageHtml(answer),
            answerMode: selectedAnswerMode,
            citations,
            mappableLocations,
            travelGuide,
            knowledgeGap: gap,
            pending: false,
            createdAt: now,
            updatedAt: new Date(),
          },
        ]);
      } else {
        this.messages.update((msgs) =>
          msgs.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  pending: false,
                  text: answer,
                  html: formatAssistantMessageHtml(answer),
                  answerMode: selectedAnswerMode,
                  citations,
                  mappableLocations,
                  travelGuide,
                  knowledgeGap: gap,
                  updatedAt: new Date(),
                }
              : message,
          ),
        );
      }

      this.activeThreadId.set(returnedThreadId ?? null);
      if (this.isWorkspaceMode()) {
        this.activeHistoryId.set(returnedThreadId ?? null);
      }
      if (publicResponse) {
        this.publicQuestionLimit.set(publicResponse.questionLimit ?? null);
        this.publicRemainingQuestions.set(publicResponse.remainingQuestions ?? null);
        this.publicRequiresSignIn.set(publicResponse.requiresSignIn === true);
      }
      if (!blocked && answer.trim()) {
        this.prepareAnswerAudioPreview(pendingId);
      }
    }

    this.shouldScrollToEnd = true;
  }

  usePrompt(prompt: string): void {
    this.question.set(prompt);
    queueMicrotask(() => {
      const input = this.composerInput?.nativeElement;
      if (!input) return;
      input.focus();
      input.setSelectionRange(prompt.length, prompt.length);
      this.autoGrowComposer();
    });
  }

  // ---- Language flag carousel -------------------------------------------------

  onVoiceLanguageSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.voiceLanguageSearch.set(input?.value ?? '');
    queueMicrotask(() => {
      const track = this.voiceLanguageTrack?.nativeElement;
      if (track) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      }
      this.syncVoiceCarouselScrollState();
    });
  }

  clearVoiceLanguageSearch(): void {
    this.voiceLanguageSearch.set('');
    queueMicrotask(() => {
      const track = this.voiceLanguageTrack?.nativeElement;
      if (track) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      }
      this.syncVoiceCarouselScrollState();
    });
  }

  scrollVoiceCarousel(direction: -1 | 1): void {
    const track = this.voiceLanguageTrack?.nativeElement;
    if (!track) {
      return;
    }

    const firstCard = track.querySelector<HTMLElement>('.lang-flag-card');
    const cardWidth = firstCard?.getBoundingClientRect().width ?? 140;
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap || window.getComputedStyle(track).gap || '0') || 0;
    const scrollAmount = Math.max(cardWidth + gap, track.clientWidth * 0.72);

    track.scrollBy({
      left: direction * scrollAmount,
      behavior: 'smooth',
    });

    window.setTimeout(() => this.syncVoiceCarouselScrollState(), 220);
  }

  syncVoiceCarouselScrollState(): void {
    const track = this.voiceLanguageTrack?.nativeElement;
    if (!track) {
      this.voiceCarouselAtStart.set(true);
      this.voiceCarouselAtEnd.set(false);
      return;
    }

    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
    this.voiceCarouselAtStart.set(track.scrollLeft <= 2);
    this.voiceCarouselAtEnd.set(track.scrollLeft >= maxScrollLeft - 2);
  }

  selectVoiceLanguage(language: VoiceLanguageOption): void {
    this.selectedVoiceLanguage.set(language);
  }

  async startSelectedVoiceLanguage(): Promise<void> {
    const language = this.selectedVoiceLanguage();
    if (!language) {
      return;
    }
    await this.startVoiceInLanguage(language);
  }

  /**
   * Start (or restart) voice mode in the selected language. The flag click only
   * chooses the language; the explicit "Speak to me" control starts the call.
   */
  async startVoiceInLanguage(language: VoiceLanguageOption): Promise<void> {
    this.selectedVoiceLanguage.set(language);
    if (this.realtimeVoiceActive()) {
      // Switching language mid-session: tear the old one down first so the new
      // greeting is spoken cleanly in the newly selected language.
      await this.stopRealtimeVoice();
    }
    await this.startRealtimeVoice(language);
  }

  async toggleRealtimeVoice(): Promise<void> {
    if (this.realtimeVoiceActive()) {
      await this.stopRealtimeVoice();
      return;
    }

    await this.startRealtimeVoice();
  }

  async startRealtimeVoice(language?: VoiceLanguageOption): Promise<void> {
    if (this.realtimeVoiceActive()) {
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.realtimeVoiceStatus.set('error');
      this.realtimeVoiceError.set('This browser does not support microphone voice mode.');
      return;
    }

    const atlasId = this.currentVoiceAtlasId();
    if (!atlasId) {
      this.realtimeVoiceStatus.set('error');
      this.realtimeVoiceError.set('Select a wiki before starting voice mode.');
      return;
    }

    const greeting = this.voiceSessionGreeting(language);
    const accentProfile = language ? this.voiceAccentProfile(language) : null;
    const cityName = this.currentWikiName();
    const cityCountry = this.currentWikiCountry();
    const linkDeliveryInstruction = 'If the user asks you to send, text, email, or provide links during the voice call, do not say you cannot send links. Say: "I will collect the relevant links and they will be included in your recap email after you hang up." Continue answering naturally, and mention that the user can send the recap from the post-call prompt.';

    this.stopAnswerAudio();
    this.realtimeVoiceEndingByUser = false;
    this.realtimeVoiceSummaryOffered = false;
    this.activeVoiceLanguageCode.set(language?.code ?? null);
    this.activeVoiceCountry.set(language?.country ?? null);
    this.realtimeVoicePanelOpen.set(true);
    this.realtimeVoiceStatus.set('connecting');
    this.realtimeVoiceMode.set(null);
    this.realtimeVoiceMuted.set(false);
    this.realtimeVoiceError.set(null);
    this.realtimeVoiceConversationId.set(null);
    this.realtimeVoiceTextInput.set('');
    this.realtimeVoiceTranscript.set([
      { id: `voice-greeting-${Date.now()}`, role: 'agent', text: greeting },
    ]);
    this.answerMode.set('internet');

    try {
      const [stream, session] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        this.chatService.createElevenLabsVoiceSession({
          atlasId,
          atlasName: this.currentWikiName(),
          anonymousVisitorId: this.isAnonymousPublicVisitor() ? this.ensureAnonymousVisitorId() : null,
          participantName: this.currentUserName() || this.currentUserEmail() || 'My living wiki visitor',
          voiceLanguageCode: language?.code ?? null,
          voiceLanguage: language?.language ?? null,
          voiceCountry: language?.country ?? null,
          voiceAccent: accentProfile?.label ?? null,
        }),
      ]);
      stream.getTracks().forEach((track) => track.stop());
      if (!session) {
        throw new Error('Voice service is unavailable.');
      }

      const voiceDynamicVariables = {
        ...(session.dynamicVariables ?? {}),
        current_city: cityName,
        current_city_country: cityCountry,
        current_living_wiki: cityName ? `My Living Wiki, ${cityName}` : 'My Living Wiki',
        requested_intro_greeting: greeting,
        link_delivery_instruction: linkDeliveryInstruction,
        city_context_instruction: cityName
          ? `This voice conversation is for the My Living Wiki city page for ${cityName}${cityCountry ? `, ${cityCountry}` : ''}. Invite questions about ${cityName}, while still answering broader questions when asked. ${linkDeliveryInstruction}`
          : `This voice conversation is for the current My Living Wiki page. ${linkDeliveryInstruction}`,
      };
      const voiceOverrides = {
        ...(session.firstMessageOverrideEnabled
          ? {
              agent: {
                firstMessage: greeting,
              },
            }
          : {}),
        ...(session.voiceOverrideEnabled && session.voiceId
          ? {
              tts: {
                voiceId: session.voiceId,
              },
            }
          : {}),
      };
      const voiceOverrideOptions = Object.keys(voiceOverrides).length > 0
        ? { overrides: voiceOverrides }
        : {};

      const { Conversation } = await import('@elevenlabs/client');
      const conversation = await Conversation.startSession({
        conversationToken: session.conversationToken,
        connectionType: 'webrtc',
        userId: session.userId,
        ...(language && accentProfile
          ? {
              dynamicVariables: {
                ...voiceDynamicVariables,
                preferred_language: language.language,
                preferred_country: language.country,
                preferred_accent: accentProfile.label,
                preferred_voice_locale: `${language.language} (${language.country})`,
                voice_accent_instruction: accentProfile.instruction,
              },
              ...voiceOverrideOptions,
            }
          : { dynamicVariables: voiceDynamicVariables, ...voiceOverrideOptions }),
        onConnect: ({ conversationId }) => {
          this.realtimeVoiceConversationId.set(conversationId);
          this.realtimeVoiceStatus.set('connected');
        },
        onDisconnect: (details) => {
          console.warn('[Voice mode] ElevenLabs disconnected', details);
          this.handleRealtimeVoiceDisconnect(details);
        },
        onStatusChange: ({ status }) => {
          console.debug('[Voice mode] status', status);
          this.realtimeVoiceStatus.set(status);
        },
        onModeChange: ({ mode }) => {
          console.debug('[Voice mode] mode', mode);
          this.realtimeVoiceMode.set(mode);
        },
        onVadScore: ({ vadScore }) => {
          if (!this.realtimeVoiceMuted()) {
            this.realtimeVoiceInputLevel.set(Math.max(this.realtimeVoiceInputLevel(), this.clampVoiceLevel(vadScore)));
          }
        },
        onAudio: () => {
          this.realtimeVoiceOutputLevel.set(Math.max(this.realtimeVoiceOutputLevel(), 0.42));
        },
        onAgentChatResponsePart: ({ text, type, event_id }) => {
          this.rememberRealtimeVoicePartialMessage(event_id, text, type);
        },
        onMessage: ({ role, message }) => {
          console.debug('[Voice mode] message', { role, message });
          if (role !== 'agent' && this.isPendingVoiceLanguagePrompt(message)) {
            return;
          }
          this.rememberRealtimeVoiceMessage(role === 'agent' ? 'agent' : 'user', message);
        },
        onError: (message) => {
          console.error('[Voice mode] error', message);
          this.realtimeVoiceStatus.set('error');
          this.realtimeVoiceError.set(message || 'Realtime voice failed.');
        },
      });

      this.realtimeVoiceConversation = conversation;
      this.startRealtimeVoiceMeter(conversation);
      if (language && accentProfile) {
        this.sendVoiceLanguageWelcomePrompt(
          conversation,
          language,
          greeting,
          accentProfile,
          session.voiceName ?? null,
          Boolean(session.firstMessageOverrideEnabled),
        );
      }
    } catch (error) {
      this.realtimeVoiceConversation = null;
      this.stopRealtimeVoiceMeter();
      this.realtimeVoiceStatus.set('error');
      this.realtimeVoiceMode.set(null);
      this.pendingVoiceLanguagePrompt = null;
      this.realtimeVoiceError.set(this.authService.toFriendlyError(error));
    }
  }

  async stopRealtimeVoice(): Promise<void> {
    const conversation = this.realtimeVoiceConversation;
    if (!conversation) {
      this.realtimeVoiceStatus.set('disconnected');
      this.realtimeVoiceMode.set(null);
      this.activeVoiceLanguageCode.set(null);
      this.activeVoiceCountry.set(null);
      this.pendingVoiceLanguagePrompt = null;
      this.realtimeVoicePanelOpen.set(false);
      return;
    }

    this.realtimeVoiceEndingByUser = true;
    this.realtimeVoiceStatus.set('disconnecting');
    this.realtimeVoiceConversation = null;
    this.stopRealtimeVoiceMeter();
    try {
      await conversation.endSession();
    } catch (error) {
      this.realtimeVoiceError.set(this.authService.toFriendlyError(error));
    } finally {
      this.offerVoiceSummaryIfUseful();
      this.realtimeVoiceStatus.set('disconnected');
      this.realtimeVoiceMode.set(null);
      this.realtimeVoiceMuted.set(false);
      this.activeVoiceLanguageCode.set(null);
      this.activeVoiceCountry.set(null);
      this.pendingVoiceLanguagePrompt = null;
      this.realtimeVoicePanelOpen.set(false);
    }
  }

  closeRealtimeVoicePanel(): void {
    if (this.realtimeVoiceConversation) {
      void this.stopRealtimeVoice();
      return;
    }
    this.realtimeVoicePanelOpen.set(false);
    this.realtimeVoiceStatus.set('disconnected');
    this.realtimeVoiceMode.set(null);
    this.realtimeVoiceMuted.set(false);
    this.activeVoiceLanguageCode.set(null);
    this.activeVoiceCountry.set(null);
    this.pendingVoiceLanguagePrompt = null;
    this.stopRealtimeVoiceMeter();
  }

  toggleRealtimeVoiceMute(): void {
    const conversation = this.realtimeVoiceConversation;
    if (!conversation || this.realtimeVoiceStatus() !== 'connected') {
      return;
    }

    const muted = !this.realtimeVoiceMuted();
    conversation.setMicMuted(muted);
    this.realtimeVoiceMuted.set(muted);
  }

  onRealtimeVoiceTextInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.realtimeVoiceTextInput.set(input?.value ?? '');
  }

  sendRealtimeVoiceTextMessage(event?: Event): void {
    event?.preventDefault();
    const text = this.realtimeVoiceTextInput().trim();
    const conversation = this.realtimeVoiceConversation;
    if (!text || !conversation || this.realtimeVoiceStatus() !== 'connected') {
      return;
    }

    this.rememberRealtimeVoiceMessage('user', text);
    conversation.sendUserMessage(text);
    this.realtimeVoiceTextInput.set('');
  }

  private meaningfulVoiceTranscript(): VoiceTranscriptItem[] {
    return this.realtimeVoiceTranscript()
      .filter((item) => !item.id.startsWith('voice-greeting-'))
      .filter((item) => !/^voice session ended:/i.test(item.text.trim()))
      .filter((item) => item.text.trim().length > 0);
  }

  private shouldOfferVoiceSummary(transcript: VoiceTranscriptItem[]): boolean {
    const hasUserTurn = transcript.some((item) => item.role === 'user');
    const hasAgentTurn = transcript.some((item) => item.role === 'agent');
    const totalTextLength = transcript.reduce((total, item) => total + item.text.trim().length, 0);
    return hasUserTurn && hasAgentTurn && totalTextLength >= 40;
  }

  private buildVoiceSummaryPreview(transcript: VoiceTranscriptItem[]): string {
    const cityName = this.currentWikiName() || 'this wiki';
    const firstUserTurn = transcript.find((item) => item.role === 'user')?.text.trim();
    if (!firstUserTurn) {
      return `Send yourself a recap of this ${cityName} voice chat, including the transcript and helpful links.`;
    }
    const compactQuestion = firstUserTurn.length > 130
      ? `${firstUserTurn.slice(0, 127).trim()}...`
      : firstUserTurn;
    return `Send yourself a recap of this ${cityName} voice chat, starting with: "${compactQuestion}"`;
  }

  private offerVoiceSummaryIfUseful(): void {
    if (this.realtimeVoiceSummaryOffered) {
      return;
    }
    const transcript = this.meaningfulVoiceTranscript();
    if (!this.shouldOfferVoiceSummary(transcript)) {
      return;
    }

    const atlas = this.currentWikiAtlas();
    const selectedLanguage = this.selectedVoiceLanguage();
    this.realtimeVoiceSummaryOffered = true;
    this.voiceSummaryModal.set({
      transcript,
      preview: this.buildVoiceSummaryPreview(transcript),
      cityName: this.currentWikiName() || 'this wiki',
      atlasId: this.currentVoiceAtlasId(),
      atlasName: this.currentWikiName() || null,
      atlasSlug: typeof atlas?.slug === 'string' ? atlas.slug : null,
      cityCountry: this.currentWikiCountry() || null,
      conversationId: this.realtimeVoiceConversationId(),
      language: selectedLanguage?.language ?? null,
      country: this.activeVoiceCountry() ?? selectedLanguage?.country ?? null,
      sentTo: null,
      answerCardUrl: null,
      continueChatUrl: null,
    });
    this.voiceSummaryEmail.set(this.currentUserEmail()?.trim() ?? '');
    this.voiceSummaryError.set(null);
    this.voiceSummarySent.set(false);
  }

  private handleRealtimeVoiceDisconnect(details: ElevenLabsDisconnectionDetails): void {
    const endedByUser = this.realtimeVoiceEndingByUser || details.reason === 'user';
    if (endedByUser) {
      this.offerVoiceSummaryIfUseful();
    }
    this.realtimeVoiceConversation = null;
    this.stopRealtimeVoiceMeter();
    this.realtimeVoiceStatus.set('disconnected');
    this.realtimeVoiceMode.set(null);
    this.realtimeVoiceMuted.set(false);
    this.activeVoiceLanguageCode.set(null);
    this.activeVoiceCountry.set(null);
    this.pendingVoiceLanguagePrompt = null;

    if (endedByUser) {
      this.realtimeVoicePanelOpen.set(false);
      this.realtimeVoiceEndingByUser = false;
      return;
    }

    this.realtimeVoicePanelOpen.set(true);
    const message = details.reason === 'error'
      ? details.message
      : details.closeReason || 'The voice session ended before audio started.';
    this.realtimeVoiceError.set(message);
    this.rememberRealtimeVoiceMessage('agent', `Voice session ended: ${message}`);
  }

  private rememberRealtimeVoiceMessage(role: VoiceTranscriptItem['role'], text: string): void {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      return;
    }

    this.realtimeVoiceTranscript.update((items) => {
      const last = items[items.length - 1];
      if (last?.role === role && last.text === trimmed) {
        return items;
      }
      if (role === 'agent' && last?.role === 'agent' && last.id.startsWith('voice-agent-live-')) {
        return [...items.slice(0, -1), { id: `voice-${Date.now()}-${items.length}`, role, text: trimmed }];
      }
      return [...items.slice(-7), { id: `voice-${Date.now()}-${items.length}`, role, text: trimmed }];
    });
  }

  private rememberRealtimeVoicePartialMessage(eventId: number, text: string, type: 'start' | 'delta' | 'stop'): void {
    if (type === 'stop') {
      return;
    }

    const normalized = text.replace(/\s+/g, ' ');
    if (!normalized.trim() && type !== 'start') {
      return;
    }

    const id = `voice-agent-live-${eventId}`;
    this.realtimeVoiceTranscript.update((items) => {
      const existingIndex = items.findIndex((item) => item.id === id);
      if (existingIndex >= 0) {
        const existing = items[existingIndex];
        const nextText = type === 'start'
          ? normalized.trim()
          : `${existing.text}${normalized}`.replace(/\s+/g, ' ').trim();
        if (!nextText) {
          return items;
        }
        const next = [...items];
        next[existingIndex] = { ...existing, text: nextText };
        return next.slice(-8);
      }
      const nextText = normalized.trim();
      if (!nextText) {
        return items;
      }
      return [...items.slice(-7), { id, role: 'agent', text: nextText }];
    });
  }

  private startRealtimeVoiceMeter(conversation: ElevenLabsConversation): void {
    this.stopRealtimeVoiceMeter();
    const tick = () => {
      if (this.realtimeVoiceConversation !== conversation || this.realtimeVoiceStatus() === 'disconnected') {
        this.stopRealtimeVoiceMeter();
        return;
      }

      const rawInput = this.realtimeVoiceMuted() ? 0 : this.safeVoiceVolume(() => conversation.getInputVolume());
      const rawOutput = this.safeVoiceVolume(() => conversation.getOutputVolume());
      const input = this.smoothVoiceLevel(this.realtimeVoiceInputLevel(), rawInput, 0.28);
      const output = this.smoothVoiceLevel(this.realtimeVoiceOutputLevel(), rawOutput, 0.24);
      const active = this.realtimeVoiceMode() === 'speaking' ? output : Math.max(input, output * 0.36);
      const energy = this.smoothVoiceLevel(this.realtimeVoiceEnergyLevel(), active, 0.34);

      this.realtimeVoiceInputLevel.set(input);
      this.realtimeVoiceOutputLevel.set(output);
      this.realtimeVoiceEnergyLevel.set(energy);
      this.realtimeVoiceMeterFrame = window.requestAnimationFrame(tick);
    };

    this.realtimeVoiceMeterFrame = window.requestAnimationFrame(tick);
  }

  private stopRealtimeVoiceMeter(): void {
    if (this.realtimeVoiceMeterFrame !== null) {
      window.cancelAnimationFrame(this.realtimeVoiceMeterFrame);
      this.realtimeVoiceMeterFrame = null;
    }
    this.realtimeVoiceInputLevel.set(0);
    this.realtimeVoiceOutputLevel.set(0);
    this.realtimeVoiceEnergyLevel.set(0);
  }

  private safeVoiceVolume(read: () => number): number {
    try {
      return this.clampVoiceLevel(read());
    } catch {
      return 0;
    }
  }

  private clampVoiceLevel(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.min(1, Math.max(0, value));
  }

  private smoothVoiceLevel(current: number, next: number, amount: number): number {
    return current + (next - current) * amount;
  }

  private voiceSessionGreeting(language?: VoiceLanguageOption): string {
    const city = this.currentWikiName();
    if (!city) {
      return language?.greeting
        ?? 'Hi, I’m your My Living Wiki voice guide. Ask me anything and I’ll answer out loud.';
    }

    switch (language?.code) {
      case 'ar':
        return `مرحباً بك في My Living Wiki، ${city}. كيف يمكنني مساعدتك بشأن ${city} اليوم؟`;
      case 'cs':
        return `Vítejte v My Living Wiki, ${city}. Jak vám dnes mohu pomoci s ${city}?`;
      case 'de':
        return `Willkommen bei My Living Wiki, ${city}. Wie kann ich dir heute zu ${city} helfen?`;
      case 'es':
        return `Bienvenido a My Living Wiki, ${city}. ¿Cómo puedo ayudarte con ${city} hoy?`;
      case 'fa':
        return `به My Living Wiki، ${city} خوش آمدید. امروز درباره ${city} چطور می‌توانم کمک کنم؟`;
      case 'fr':
        return `Bienvenue sur My Living Wiki, ${city}. Comment puis-je vous aider avec ${city} aujourd’hui ?`;
      case 'hi':
        return `My Living Wiki, ${city} में आपका स्वागत है। आज मैं ${city} के बारे में आपकी कैसे मदद कर सकता हूँ?`;
      case 'hr':
        return `Dobrodošli u My Living Wiki, ${city}. Kako vam danas mogu pomoći s ${city}?`;
      case 'ja':
        return `My Living Wiki、${city}へようこそ。今日は${city}について、どのようにお手伝いできますか？`;
      case 'ko':
        return `My Living Wiki, ${city}에 오신 것을 환영합니다. 오늘 ${city}에 대해 어떻게 도와드릴까요?`;
      case 'nl':
        return `Welkom bij My Living Wiki, ${city}. Hoe kan ik u vandaag helpen met ${city}?`;
      case 'no':
        return `Velkommen til My Living Wiki, ${city}. Hvordan kan jeg hjelpe deg med ${city} i dag?`;
      case 'pt':
      case 'pt-br':
        return `Bem-vindo ao My Living Wiki, ${city}. Como posso ajudar com ${city} hoje?`;
      case 'ru':
        return `Добро пожаловать в My Living Wiki, ${city}. Чем я могу помочь вам сегодня по ${city}?`;
      case 'sv':
        return `Välkommen till My Living Wiki, ${city}. Hur kan jag hjälpa dig med ${city} idag?`;
      case 'tr':
        return `My Living Wiki, ${city} sayfasına hoş geldiniz. Bugün ${city} hakkında size nasıl yardımcı olabilirim?`;
      case 'zh':
        return `欢迎来到 My Living Wiki，${city}。今天我可以怎样帮你了解 ${city}？`;
      case 'en':
      default:
        return `Welcome to My Living Wiki, ${city}. How can I help you with ${city} today?`;
    }
  }

  private sendVoiceLanguageWelcomePrompt(
    conversation: ElevenLabsConversation,
    language: VoiceLanguageOption,
    greeting: string,
    accentProfile: VoiceAccentProfile,
    voiceName: string | null,
    firstMessageOverrideEnabled: boolean,
  ): void {
    const prompt = [
      `Please greet me now in ${language.language} for ${language.country}.`,
      `Say exactly this greeting first: "${greeting}"`,
      `The current My Living Wiki city context is ${this.currentWikiName() || 'the selected city wiki'}.`,
      accentProfile.instruction,
      'For the rest of this voice session, keep speaking in this language and accent unless I ask to switch.',
      this.currentWikiName()
        ? `When helpful, invite me to ask questions about ${this.currentWikiName()}.`
        : 'When helpful, invite me to ask questions about this city.',
      'Keep it warm and brief, then wait for my spoken question.',
    ].join(' ');

    this.pendingVoiceLanguagePrompt = prompt.replace(/\s+/g, ' ').trim();

    window.setTimeout(() => {
      if (this.realtimeVoiceConversation !== conversation || this.realtimeVoiceStatus() !== 'connected') {
        return;
      }

      try {
        conversation.sendContextualUpdate([
          `The visitor selected ${language.country} / ${language.language}.`,
          `The current Living Wiki context is ${this.currentWikiName() || 'the selected city wiki'}.`,
          `Voice and accent target: ${accentProfile.label}.`,
          voiceName ? `Selected ElevenLabs voice: ${voiceName}.` : 'No dedicated ElevenLabs native voice was selected; use the closest available native accent.',
          accentProfile.instruction,
          'Avoid an English accent unless the selected country/language is English.',
          'If the agent has configured language-specific or multi-voice voices, use the closest matching native voice for this language and country.',
        ].join(' '), { contextId: `voice-accent-${language.country.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` });
        if (!firstMessageOverrideEnabled) {
          conversation.sendUserMessage(prompt);
        }
      } catch (error) {
        console.warn('[Voice mode] Could not send language greeting prompt', error);
        this.pendingVoiceLanguagePrompt = null;
      }
    }, 120);
  }

  private isPendingVoiceLanguagePrompt(message: string): boolean {
    const pending = this.pendingVoiceLanguagePrompt;
    if (!pending) {
      return false;
    }

    const normalized = message.replace(/\s+/g, ' ').trim();
    if (normalized !== pending) {
      return false;
    }

    this.pendingVoiceLanguagePrompt = null;
    return true;
  }

  private voiceAccentProfile(language: VoiceLanguageOption): VoiceAccentProfile {
    const country = language.country;
    const profiles: Record<string, VoiceAccentProfile> = {
      'United States': {
        label: 'native American English accent',
        instruction: 'Speak with a natural native American English accent and casual US pacing.',
      },
      Canada: {
        label: 'native Canadian English accent',
        instruction: 'Speak with a natural native Canadian English accent and clear Canadian pacing.',
      },
      England: {
        label: 'native English accent from England',
        instruction: 'Speak with a natural native English accent from England, not an American accent.',
      },
      Australia: {
        label: 'native Australian English accent',
        instruction: 'Speak with a natural native Australian English accent and relaxed Australian pacing.',
      },
      Nigeria: {
        label: 'native Nigerian English accent',
        instruction: 'Speak with a natural Nigerian English accent, not American or British English.',
      },
      Ghana: {
        label: 'native Ghanaian English accent',
        instruction: 'Speak with a natural Ghanaian English accent, not American or British English.',
      },
      'South Africa': {
        label: 'native South African English accent',
        instruction: 'Speak with a natural South African English accent, not American or British English.',
      },
      Mexico: {
        label: 'native Mexican Spanish accent',
        instruction: 'Speak Spanish with a natural Mexican accent and pronunciation; do not use an English accent.',
      },
      Argentina: {
        label: 'native Argentine Spanish accent',
        instruction: 'Speak Spanish with a natural Argentine accent, including local rhythm where appropriate; do not use an English accent.',
      },
      Uruguay: {
        label: 'native Uruguayan Spanish accent',
        instruction: 'Speak Spanish with a natural Uruguayan accent and Rioplatense rhythm where appropriate; do not use an English accent.',
      },
      Colombia: {
        label: 'native Colombian Spanish accent',
        instruction: 'Speak Spanish with a natural Colombian accent and pronunciation; do not use an English accent.',
      },
      Ecuador: {
        label: 'native Ecuadorian Spanish accent',
        instruction: 'Speak Spanish with a natural Ecuadorian accent and pronunciation; do not use an English accent.',
      },
      Paraguay: {
        label: 'native Paraguayan Spanish accent',
        instruction: 'Speak Spanish with a natural Paraguayan accent and pronunciation; do not use an English accent.',
      },
      Spain: {
        label: 'native Spanish accent from Spain',
        instruction: 'Speak Spanish with a natural Spain accent and pronunciation; do not use a Latin American or English accent.',
      },
      France: {
        label: 'native French accent from France',
        instruction: 'Speak French with a natural France French accent and pronunciation; do not use an English accent.',
      },
      Belgium: {
        label: 'native Belgian French accent',
        instruction: 'Speak French with a natural Belgian French accent and pronunciation; do not use an English accent.',
      },
      Senegal: {
        label: 'native Senegalese French accent',
        instruction: 'Speak French with a natural Senegalese French accent and pronunciation; do not use an English accent.',
      },
      'Ivory Coast': {
        label: 'native Ivorian French accent',
        instruction: 'Speak French with a natural Ivorian French accent and pronunciation; do not use an English accent.',
      },
      Cameroon: {
        label: 'native Cameroonian French accent',
        instruction: 'Speak French with a natural Cameroonian French accent and pronunciation; do not use an English accent.',
      },
      Brazil: {
        label: 'native Brazilian Portuguese accent',
        instruction: 'Speak Portuguese with a natural Brazilian accent and pronunciation; do not use a Portugal or English accent.',
      },
      Portugal: {
        label: 'native European Portuguese accent',
        instruction: 'Speak Portuguese with a natural European Portuguese accent and pronunciation; do not use a Brazilian or English accent.',
      },
      Germany: {
        label: 'native German accent from Germany',
        instruction: 'Speak German with a natural Germany German accent and pronunciation; do not use an English accent.',
      },
      Switzerland: {
        label: 'native Swiss German accent',
        instruction: 'Speak German with a natural Swiss German accent where appropriate; do not use an English accent.',
      },
      Austria: {
        label: 'native Austrian German accent',
        instruction: 'Speak German with a natural Austrian accent and pronunciation; do not use an English accent.',
      },
      Morocco: {
        label: 'native Moroccan Arabic accent',
        instruction: 'Speak Arabic with a natural Moroccan accent where appropriate; do not use an English accent.',
      },
      Egypt: {
        label: 'native Egyptian Arabic accent',
        instruction: 'Speak Arabic with a natural Egyptian accent where appropriate; do not use an English accent.',
      },
      'Saudi Arabia': {
        label: 'native Saudi Arabic accent',
        instruction: 'Speak Arabic with a natural Saudi accent where appropriate; do not use an English accent.',
      },
      Qatar: {
        label: 'native Qatari Arabic accent',
        instruction: 'Speak Arabic with a natural Qatari accent where appropriate; do not use an English accent.',
      },
    };

    const matched = profiles[country];
    if (matched) {
      return matched;
    }

    return {
      label: `native ${language.language} accent for ${country}`,
      instruction: `Speak ${language.language} with a natural native accent from ${country} or the closest native regional accent. Do not use an English accent unless ${language.language} is English.`,
    };
  }

  async toggleReadAnswer(message: ChatMessage, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    if (message.pending || !message.text.trim() || typeof Audio === 'undefined') {
      return;
    }
    this.shouldScrollToEnd = false;
    const scrollPosition = this.voiceClickScrollPosition ?? this.captureScrollPosition();
    this.lockScrollPosition(scrollPosition);

    if (this.playingSpeechMessageId() === message.id) {
      this.stopAnswerAudio();
      this.unlockScrollPosition(scrollPosition);
      return;
    }

    this.stopAnswerAudio();
    this.speechError.set(null);
    this.speechErrorMessageId.set(null);

    const audio = new Audio();
    audio.preload = 'auto';
    audio.onended = () => this.stopAnswerAudio();
    audio.onerror = () => {
      this.speechError.set('Audio playback failed.');
      this.speechErrorMessageId.set(message.id);
      this.stopAnswerAudio();
    };
    this.answerAudio = audio;
    void audio.play().catch(() => undefined);

    const audioUrlPromise = this.ensureAnswerAudioUrl(message, true);
    this.restoreScrollPosition(scrollPosition);
    const audioUrl = await audioUrlPromise;
    if (!audioUrl || this.answerAudio !== audio) {
      this.unlockScrollPosition(scrollPosition);
      return;
    }

    audio.src = audioUrl;
    this.playingSpeechMessageId.set(message.id);
    this.restoreScrollPosition(scrollPosition);

    try {
      await audio.play();
      this.unlockScrollPosition(scrollPosition);
    } catch (error) {
      this.speechError.set(this.authService.toFriendlyError(error));
      this.speechErrorMessageId.set(message.id);
      this.stopAnswerAudio();
      this.unlockScrollPosition(scrollPosition);
    }
  }

  prepareReadAnswerClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.shouldScrollToEnd = false;
    this.voiceClickScrollPosition = this.captureScrollPosition();
    this.lockScrollPosition(this.voiceClickScrollPosition);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
  }

  setAnswerMode(mode: 'wiki' | 'internet'): void {
    if (!this.canUseAnswerModeToggle()) {
      this.answerMode.set('internet');
      return;
    }
    if (mode === 'wiki' && !this.hasWikiDocuments()) {
      this.answerMode.set('internet');
      return;
    }
    this.answerMode.set(mode);
  }

  openCitation(citation: CitationPassage): void {
    this.selectedCitation.set(citation);
  }

  closeCitation(): void {
    this.selectedCitation.set(null);
  }

  formatCitationText(text: string): string {
    return text
      .replace(/\[Source:\s*[^\]]*\]/g, '')
      .replace(/\[Source:[^\]]*$/gm, '')
      .replace(/^#{2,3}\s+(.+)$/gm, '<strong class="block mt-3 mb-1 font-bold text-[var(--text)]">$1</strong>')
      .replace(/^\* /gm, '- ')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-[var(--text)]">$1</strong>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc leading-7">$1</li>')
      .replace(/\n\n/g, '</p><p class="mt-2">')
      .replace(/\n/g, '<br/>')
      .replace(/(<br\/>)+\s*$/g, '');
  }

  async openDocumentFile(citation: CitationPassage): Promise<void> {
    const filename = citation.filename;
    if (!filename || this.isFallbackCitationFilename(filename)) {
      return;
    }

    if (this.isPublicVisitorMode()) {
      const atlasId = this.publicAtlas()?.id;
      if (!atlasId) {
        return;
      }

      const downloadUrl = await this.documentsService.getPublicDocumentLink(atlasId, filename);
      if (downloadUrl) {
        window.open(this.withCitationAnchor(downloadUrl, citation), '_blank', 'noopener,noreferrer');
      }
      return;
    }

    const documents = this.documentsService.documents();
    const match = documents.find(
      (doc) => doc.filename === filename || doc.title === filename,
    );

    if (!match) {
      return;
    }

    const downloadUrl = await this.documentsService.getAccessibleDownloadUrl(match);
    if (downloadUrl) {
      window.open(this.withCitationAnchor(downloadUrl, citation), '_blank', 'noopener,noreferrer');
    }
  }

  newChat(): void {
    this.clearSpeechState(true);
    this.messages.set([]);
    this.syncArtifactLinksFromMessages([]);
    this.question.set('');
    this.selectedCitation.set(null);
    this.activeHistoryId.set(null);
    this.activeThreadId.set(null);
    this.messageActionMenuId.set(null);
    this.pendingDeleteHistoryItem.set(null);
    this.answerMode.set(this.defaultAnswerMode(this.currentWikiAtlas()));
    queueMicrotask(() => this.autoGrowComposer());
  }

  async loadHistoryItem(item: ChatHistoryItem): Promise<void> {
    this.clearSpeechState(true);
    this.activeHistoryId.set(item.id);
    this.selectedCitation.set(null);
    this.messageActionMenuId.set(null);
    this.activeThreadId.set(item.kind === 'thread' ? item.id : null);
    const storedMessages = await this.chatService.loadHistoryMessages(item);
    const mappedMessages = storedMessages.map((message) => this.mapStoredMessage(message));
    this.messages.set(mappedMessages);
    this.syncArtifactLinksFromMessages(mappedMessages);
    this.syncAnswerModeFromMessages(mappedMessages);
    this.shouldScrollToEnd = true;
  }

  toggleHistoryExpanded(): void {
    this.historyExpanded.update((value) => !value);
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (this.canSubmit()) {
        void this.submitQuestion();
      }
    }
  }

  onComposerInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    if (!target) return;
    this.question.set(target.value);
    this.resizeComposer(target);
  }

  autoGrowComposer(): void {
    const input = this.composerInput?.nativeElement;
    if (!input) return;
    this.resizeComposer(input);
  }

  private resizeComposer(input: HTMLTextAreaElement): void {
    input.style.height = 'auto';
    const maxHeight = Number.parseFloat(window.getComputedStyle(input).maxHeight);
    const nextHeight = Number.isFinite(maxHeight)
      ? Math.min(input.scrollHeight, maxHeight)
      : input.scrollHeight;
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > nextHeight ? 'auto' : 'hidden';
  }

  handlePrimaryAction(): void {
    if (this.showSignInCta()) {
      void this.goToSignIn();
      return;
    }

    if (this.canSubmit()) {
      void this.submitQuestion();
    }
  }

  truncate(text: string, max = 48): string {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max).trim()}...` : text;
  }

  messageLabel(message: ChatMessage): string {
    if (message.role === 'user') {
      return 'You';
    }
    return message.answerMode === 'internet' ? 'Internet' : 'My living wiki';
  }

  assistantMessageName(): string {
    return this.currentWikiGuide()?.name?.trim() || 'My living wiki';
  }

  assistantMessageSubtitle(message: ChatMessage): string {
    const guideLabel = this.currentWikiGuide()?.label?.trim();
    return guideLabel || this.messageLabel(message);
  }

  assistantAvatarUrl(): string {
    return this.currentWikiGuide()?.image_url?.trim() || '/assets/image/my-living-wiki.png';
  }

  assistantAvatarAlt(): string {
    const name = this.assistantMessageName();
    return name === 'My living wiki' ? 'My living wiki' : `${name} guide`;
  }

  travelGuideForMessage(message: ChatMessage): TravelGuideStructuredResponse | null {
    return message.role === 'assistant' && !message.pending ? message.travelGuide ?? null : null;
  }

  travelCardImageUrl(card: TravelGuideCard): string | null {
    return card.image_url?.trim() || null;
  }

  travelGuideHeroImage(): string | null {
    return this.currentWikiGuide()?.banner_url?.trim() || this.currentWikiAtlas()?.hero_url?.trim() || null;
  }

  travelCardVisualBackground(card: TravelGuideCard, index: number): string {
    const text = `${card.title} ${card.best_for ?? ''} ${card.vibe ?? ''}`.toLowerCase();
    if (/(food|steak|cheese|restaurant|sandwich|bar|coffee|market|eat|drink)/.test(text)) {
      return 'linear-gradient(135deg, #6f1d1b 0%, #b45309 48%, #d6a94a 100%)';
    }
    if (/(museum|history|historic|hall|art|gallery|library)/.test(text)) {
      return 'linear-gradient(135deg, #1f3b57 0%, #3a6d8c 52%, #c49a4a 100%)';
    }
    if (/(park|trail|river|garden|outdoor|walk)/.test(text)) {
      return 'linear-gradient(135deg, #155e4b 0%, #5f8f55 52%, #d0b15e 100%)';
    }
    if (/(music|show|theater|night|club|venue)/.test(text)) {
      return 'linear-gradient(135deg, #3b1d5f 0%, #7c3f78 52%, #d08a45 100%)';
    }
    if (/(shop|store|boutique)/.test(text)) {
      return 'linear-gradient(135deg, #17405e 0%, #3f7f89 52%, #d1a45f 100%)';
    }
    const fallback = index % 2 === 0
      ? 'linear-gradient(135deg, #1f3b57 0%, #5d6f82 52%, #d0a85b 100%)'
      : 'linear-gradient(135deg, #2d4656 0%, #7a6a52 52%, #c69c4a 100%)';
    return fallback;
  }

  travelCardVisualIcon(card: TravelGuideCard): string {
    const text = `${card.title} ${card.best_for ?? ''} ${card.vibe ?? ''}`.toLowerCase();
    if (/(food|steak|cheese|restaurant|sandwich|bar|coffee|market|eat|drink)/.test(text)) {
      return 'restaurant';
    }
    if (/(museum|history|historic|hall|art|gallery|library)/.test(text)) {
      return 'museum';
    }
    if (/(park|trail|river|garden|outdoor|walk)/.test(text)) {
      return 'park';
    }
    if (/(music|show|theater|night|club|venue)/.test(text)) {
      return 'local_activity';
    }
    if (/(shop|store|market|boutique)/.test(text)) {
      return 'storefront';
    }
    return 'place';
  }

  travelCardDescription(card: TravelGuideCard): string {
    let description = this.cleanTravelCardText(card.description ?? '');
    const title = this.escapeRegExp(this.cleanTravelCardText(card.title ?? ''));
    if (title) {
      description = description.replace(new RegExp(`^${title}\\s*(?:\\([^)]*\\))?\\s*[:–-]\\s*`, 'i'), '').trim();
    }
    const neighborhood = this.escapeRegExp(this.cleanTravelCardText(card.neighborhood || card.subtitle || ''));
    if (neighborhood) {
      description = description.replace(new RegExp(`^\\(?${neighborhood}\\)?\\s*[:–-]\\s*`, 'i'), '').trim();
    }
    return description || this.cleanTravelCardText(card.description ?? '');
  }

  guideIntro(message: ChatMessage, guide: TravelGuideStructuredResponse): string {
    const question = this.questionBeforeMessage(message.id).replace(/[?!.]+$/, '').trim();
    const topic = question || guide.title || 'this Philly mission';
    const stopCount = guide.cards.length;
    const firstStop = guide.cards[0]?.title?.trim();
    if (/cheesesteak|steak|sandwich|food|eat|restaurant/i.test(topic)) {
      return `For ${topic.toLowerCase()}, here is the no-nonsense route before hunger starts making policy decisions.`;
    }
    if (/weekend|today|tonight|date|visit|do|itinerary|tour/i.test(topic)) {
      return `For ${topic.toLowerCase()}, here is a tight ${stopCount}-stop plan that keeps the day moving and the detours honest.`;
    }
    if (firstStop) {
      return `For ${topic.toLowerCase()}, start with ${firstStop} and let the rest of the cards keep you out of spreadsheet-mode planning.`;
    }
    return `For ${topic.toLowerCase()}, here is the practical version: useful stops first, overthinking politely escorted out.`;
  }

  travelCardMapUrl(card: TravelGuideCard): string {
    const query = card.map_query?.trim() || card.subtitle?.trim() || card.title;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  travelCardSourceUrl(card: TravelGuideCard): string | null {
    const sourceUrl = card.source_url?.trim();
    if (!sourceUrl) {
      return null;
    }
    try {
      const parsed = new URL(sourceUrl);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  }

  travelCardSaved(card: TravelGuideCard): boolean {
    return this.savedTravelCardIds()[this.travelCardStorageId(card)] === true;
  }

  saveTravelCard(card: TravelGuideCard, event?: MouseEvent): void {
    event?.stopPropagation();
    const storageId = this.travelCardStorageId(card);
    const next = {
      ...this.savedTravelCardIds(),
      [storageId]: true,
    };
    this.savedTravelCardIds.set(next);
    this.persistSavedTravelCardIds(next);
    this.copiedTarget.set(`save:${storageId}`);
  }

  async shareTravelCard(card: TravelGuideCard, event?: MouseEvent, message?: ChatMessage, guide?: TravelGuideStructuredResponse): Promise<void> {
    event?.stopPropagation();
    const target = `share:${this.travelCardStorageId(card)}`;
    if (this.sharingTravelCardId()) {
      return;
    }

    this.sharingTravelCardId.set(target);
    try {
      const atlas = this.currentWikiAtlas();
      const share = await this.answerCardService.createTravelCardShare({
        card,
        atlasId: atlas?.id ?? null,
        atlasName: atlas?.name ?? null,
        guideTitle: guide?.title ?? null,
        guideSummary: guide?.summary ?? null,
        question: message ? this.questionBeforeMessage(message.id) : null,
        threadId: this.activeThreadId(),
        sourceMessageId: message?.id ?? null,
      });
      this.sharePageModal.set({
        title: card.title,
        subtitle: 'This individual card now has its own public share page.',
        url: share.url,
      });
    } catch {
      await this.copyText(target, this.buildTravelCardShareText(card));
    } finally {
      this.sharingTravelCardId.set(null);
    }
  }

  async shareGuideCardForMessage(message: ChatMessage, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    if (!this.canCreateAnswerCard(message) || this.creatingAnswerCardId()) {
      return;
    }

    const cardId = await this.ensureAnswerCardForMessage(message);
    if (!cardId) {
      return;
    }
    this.sharePageModal.set({
      title: message.travelGuide?.title || 'Share the full guide card',
      subtitle: 'This opens the full Answer Card share page with social preview metadata.',
      url: this.buildAnswerCardShareUrl(cardId),
    });
  }

  closeSharePageModal(): void {
    this.sharePageModal.set(null);
  }

  async copySharePageModalUrl(): Promise<void> {
    const modal = this.sharePageModal();
    if (!modal) {
      return;
    }
    await this.copyText('share-page-modal', modal.url);
  }

  openSharePageModalUrl(): void {
    const modal = this.sharePageModal();
    if (!modal || typeof window === 'undefined') {
      return;
    }
    window.open(modal.url, '_blank', 'noopener,noreferrer');
  }

  sharePageHref(platform: string): string {
    const modal = this.sharePageModal();
    if (!modal) {
      return '#';
    }

    const encodedUrl = encodeURIComponent(modal.url);
    const encodedTitle = encodeURIComponent(modal.title);
    const encodedText = encodeURIComponent(`${modal.title} — ${modal.subtitle}`);
    const encodedTextWithUrl = encodeURIComponent(`${modal.title} — ${modal.subtitle}\n${modal.url}`);
    const targets: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      whatsapp: `https://wa.me/?text=${encodedTextWithUrl}`,
      email: `mailto:?subject=${encodedTitle}&body=${encodedTextWithUrl}`,
    };
    return targets[platform] ?? '#';
  }

  formatRelativeDateShort(value: { toDate(): Date } | Date | null | undefined): string {
    const date = this.asDate(value);
    if (!date) {
      return 'now';
    }

    const deltaMs = Math.max(0, Date.now() - date.getTime());
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    if (deltaMs < hour) {
      return `${Math.max(1, Math.floor(deltaMs / minute) || 1)}m`;
    }
    if (deltaMs < day) {
      return `${Math.floor(deltaMs / hour)}h`;
    }
    if (deltaMs < week) {
      return `${Math.floor(deltaMs / day)}d`;
    }
    if (deltaMs < month) {
      return `${Math.floor(deltaMs / week)}w`;
    }
    if (deltaMs < year) {
      return `${Math.floor(deltaMs / month)}mo`;
    }
    return `${Math.floor(deltaMs / year)}y`;
  }

  formatDate(value: { toDate(): Date } | Date | null | undefined): string {
    const date = this.asDate(value);
    if (!date) {
      return 'Just now';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  }

  formatDateTime(value: { toDate(): Date } | Date | null | undefined): string {
    const date = this.asDate(value);
    if (!date) {
      return 'Just now';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  toggleMessageActions(messageId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.messageActionMenuId.update((current) => (current === messageId ? null : messageId));
  }

  confirmDeleteHistoryItem(item: ChatHistoryItem, event?: MouseEvent): void {
    event?.stopPropagation();
    this.pendingDeleteHistoryItem.set(item);
  }

  cancelDeleteHistoryItem(): void {
    this.pendingDeleteHistoryItem.set(null);
  }

  async deleteHistoryItem(): Promise<void> {
    const item = this.pendingDeleteHistoryItem();
    if (!item || this.isDeletingHistory()) {
      return;
    }

    this.isDeletingHistory.set(true);
    try {
      await this.chatService.deleteQuery(item.id);
      if (this.activeHistoryId() === item.id) {
        this.newChat();
      }
      this.pendingDeleteHistoryItem.set(null);
    } finally {
      this.isDeletingHistory.set(false);
    }
  }

  async copyWholeChat(): Promise<void> {
    const transcript = this.messages()
      .map((message) => this.buildMessageCopyText(message))
      .join('\n\n')
      .trim();

    if (!transcript) {
      return;
    }

    await this.copyText('chat-thread', transcript);
  }

  openShareModal(): void {
    const threadId = this.activeThreadId();
    if (!threadId) {
      return;
    }

    this.shareModalError.set(null);
    this.generatedShareLink.set(this.activeThreadIsShared() ? this.buildShareUrl(threadId) : null);
    this.shareModalOpen.set(true);
  }

  closeShareModal(): void {
    this.shareModalOpen.set(false);
    this.shareModalError.set(null);
  }

  openSubscribeModal(): void {
    const atlas = this.currentWikiAtlas();
    if (!atlas || !this.canSubscribeToCurrentWiki()) {
      return;
    }

    const currentEmail = this.currentUserEmail()?.trim() ?? '';
    this.subscribeEmail.set(currentEmail);
    this.subscribeError.set(null);
    this.subscribeSuccess.set(null);
    this.subscribeModalOpen.set(true);
  }

  closeSubscribeModal(): void {
    if (this.isSubscribing()) {
      return;
    }
    this.subscribeModalOpen.set(false);
    this.subscribeError.set(null);
    this.subscribeSuccess.set(null);
  }

  onSubscribeEmailInput(event: Event): void {
    this.subscribeEmail.set((event.target as HTMLInputElement).value);
    this.subscribeError.set(null);
  }

  async subscribeToUpdates(event: Event): Promise<void> {
    event.preventDefault();
    const atlas = this.currentWikiAtlas();
    const email = this.subscribeEmail().trim().toLowerCase();
    if (!atlas?.id || this.isSubscribing()) {
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.subscribeError.set('Enter a valid email address.');
      return;
    }

    this.isSubscribing.set(true);
    this.subscribeError.set(null);
    this.subscribeSuccess.set(null);
    try {
      const result = await this.atlasService.subscribeToAtlasUpdates({
        atlasId: atlas.id,
        email,
        anonymousVisitorId: this.anonymousVisitorId(),
      });
      this.subscribeSuccess.set(
        result.alreadySubscribed
          ? 'You are already subscribed to weekly updates for this wiki.'
          : 'You are subscribed. A confirmation email is on the way.',
      );
    } catch (error) {
      this.subscribeError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSubscribing.set(false);
    }
  }

  onVoiceSummaryEmailInput(event: Event): void {
    this.voiceSummaryEmail.set((event.target as HTMLInputElement).value);
    this.voiceSummaryError.set(null);
  }

  closeVoiceSummaryModal(): void {
    if (this.voiceSummarySending()) {
      return;
    }
    this.voiceSummaryModal.set(null);
    this.voiceSummaryError.set(null);
    this.voiceSummarySent.set(false);
  }

  async sendVoiceSummaryEmail(event: Event): Promise<void> {
    event.preventDefault();
    const modal = this.voiceSummaryModal();
    const email = this.voiceSummaryEmail().trim().toLowerCase();
    if (!modal || this.voiceSummarySending()) {
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.voiceSummaryError.set('Enter a valid email address.');
      return;
    }

    const transcript: VoiceSummaryTranscriptItem[] = modal.transcript.map((item) => ({
      role: item.role,
      text: item.text,
    }));
    this.voiceSummarySending.set(true);
    this.voiceSummaryError.set(null);
    try {
      const result = await this.chatService.sendVoiceConversationSummary({
        atlasId: modal.atlasId,
        atlasName: modal.atlasName,
        atlasSlug: modal.atlasSlug,
        cityName: modal.cityName,
        cityCountry: modal.cityCountry,
        anonymousVisitorId: this.isAnonymousPublicVisitor() ? this.ensureAnonymousVisitorId() : null,
        recipientEmail: email,
        recipientName: this.currentUserName() || null,
        transcript,
        conversationId: modal.conversationId,
        language: modal.language,
        country: modal.country,
        createAnswerCard: true,
      });
      if (!result?.sent) {
        throw new Error('The recap could not be sent.');
      }
      this.voiceSummarySent.set(true);
      this.voiceSummaryModal.set({
        ...modal,
        sentTo: result.recipientEmail,
        answerCardUrl: result.answerCardUrl ?? null,
        continueChatUrl: result.continueChatUrl ?? null,
      });
    } catch (error) {
      this.voiceSummaryError.set(this.authService.toFriendlyError(error));
    } finally {
      this.voiceSummarySending.set(false);
    }
  }

  async createShareLink(): Promise<void> {
    const threadId = this.activeThreadId();
    if (!threadId || this.isSharingThread()) {
      return;
    }

    this.isSharingThread.set(true);
    try {
      const result = await this.chatService.shareThread(threadId);
      if (!result) {
        return;
      }

      this.shareModalError.set(null);
      this.generatedShareLink.set(this.buildShareUrl(result.threadId));
    } catch (error) {
      this.shareModalError.set(this.authService.toFriendlyError(error));
    } finally {
      this.isSharingThread.set(false);
    }
  }

  async copyShareLink(): Promise<void> {
    const shareLink = this.generatedShareLink();
    if (!shareLink) {
      return;
    }

    await this.copyText('chat-share-link', shareLink);
  }

  async copyMessage(message: ChatMessage, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    await this.copyText(message.id, this.buildMessageCopyText(message));
    this.messageActionMenuId.set(null);
  }

  async copyMessageBody(message: ChatMessage, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    await this.copyText(`${message.id}:body`, message.text.trim());
  }

  canCreateAnswerCard(message: ChatMessage): boolean {
    return message.role === 'assistant' &&
      !message.pending &&
      !!message.text.trim() &&
      (this.isSignedIn() || this.isAnonymousPublicVisitor());
  }

  canShowAnswerCardAction(message: ChatMessage): boolean {
    return message.role === 'assistant' && !message.pending && !!message.text.trim();
  }

  canCreateAnswerQuiz(message: ChatMessage): boolean {
    return this.canShowAnswerCardAction(message) && this.isSignedIn();
  }

  async createAnswerCardForMessage(message: ChatMessage, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    if (!this.canCreateAnswerCard(message) || this.creatingAnswerCardId()) {
      return;
    }

    const cardId = await this.ensureAnswerCardForMessage(message);
    if (cardId) {
      await this.router.navigateByUrl(`/answer-card/${cardId}`);
    }
  }

  async createQuizForMessage(message: ChatMessage, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    if (!this.canCreateAnswerQuiz(message) || this.creatingQuizId() || this.creatingAnswerCardId()) {
      return;
    }

    if (message.answerQuizId) {
      await this.router.navigateByUrl(`/quiz/${message.answerQuizId}`);
      return;
    }

    this.answerCardError.set(null);
    this.answerCardErrorMessageId.set(null);
    this.creatingQuizId.set(message.id);
    this.messageActionMenuId.set(null);

    try {
      const cardId = await this.ensureAnswerCardForMessage(message);
      if (!cardId) {
        return;
      }
      const quiz = await this.answerQuizService.createQuizFromAnswerCard(cardId, {
        sourceMessageId: message.id,
        sourceMessageKind: this.sourceMessageKind(),
      });
      const quizLink = `/quiz/${quiz.id}`;
      this.quizLinks.update((links) => ({
        ...links,
        [message.id]: quizLink,
      }));
      this.messages.update((messages) =>
        messages.map((item) => item.id === message.id ? { ...item, answerCardId: cardId, answerQuizId: quiz.id } : item),
      );
      await this.router.navigateByUrl(quizLink);
    } catch (error) {
      this.answerCardError.set(error instanceof Error ? error.message : 'Failed to create quiz.');
      this.answerCardErrorMessageId.set(message.id);
    } finally {
      this.creatingQuizId.set(null);
    }
  }

  private async ensureAnswerCardForMessage(message: ChatMessage): Promise<string | null> {
    const existingCardId = message.answerCardId ?? this.cardIdFromLink(this.answerCardLinks()[message.id]);
    if (existingCardId) {
      this.answerCardLinks.update((links) => ({
        ...links,
        [message.id]: `/answer-card/${existingCardId}`,
      }));
      return existingCardId;
    }

    this.answerCardError.set(null);
    this.answerCardErrorMessageId.set(null);
    this.creatingAnswerCardId.set(message.id);
    this.messageActionMenuId.set(null);

    try {
      const question = this.questionBeforeMessage(message.id);
      const atlas = this.currentWikiAtlas();
      const card = await this.answerCardService.createAnswerCard({
        question: question || 'My living wiki question',
        answer: message.text,
        atlasId: atlas?.id ?? null,
        threadId: this.activeThreadId(),
        sourceMessageId: message.id,
        sourceMessageKind: this.sourceMessageKind(),
        answerMode: message.answerMode ?? this.answerMode(),
        mappableLocations: message.mappableLocations ?? [],
        anonymousVisitorId: this.isAnonymousPublicVisitor() ? this.ensureAnonymousVisitorId() : null,
      });
      this.answerCardLinks.update((links) => ({
        ...links,
        [message.id]: `/answer-card/${card.id}`,
      }));
      this.messages.update((messages) =>
        messages.map((item) => item.id === message.id ? { ...item, answerCardId: card.id } : item),
      );
      return card.id;
    } catch (error) {
      this.answerCardError.set(error instanceof Error ? error.message : 'Failed to create answer card.');
      this.answerCardErrorMessageId.set(message.id);
      return null;
    } finally {
      this.creatingAnswerCardId.set(null);
    }
  }

  private cardIdFromLink(link: string | undefined): string | null {
    if (!link) {
      return null;
    }
    const match = link.match(/\/answer-card\/([^/?#]+)/);
    return match?.[1] ?? null;
  }

  private sourceMessageKind(): 'workspace' | 'public' {
    return this.isPublicVisitorMode() ? 'public' : 'workspace';
  }

  ngAfterViewChecked(): void {
    if (this.voiceScrollLockTimer) {
      this.shouldScrollToEnd = false;
      this.restoreScrollPosition(this.voiceClickScrollPosition);
      return;
    }

    if (this.shouldScrollToEnd) {
      this.shouldScrollToEnd = false;
      this.transcriptEnd?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  ngOnDestroy(): void {
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = null;
    }
    if (this.copyFeedbackTimeout) {
      clearTimeout(this.copyFeedbackTimeout);
      this.copyFeedbackTimeout = null;
    }
    this.unlockScrollPosition(this.voiceClickScrollPosition);
    this.clearSpeechState(true);
    void this.stopRealtimeVoice();
  }

  toggleAvatarMenu(): void {
    this.avatarMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;

    if (!target?.closest('.avatar-menu-wrapper')) {
      this.avatarMenuOpen.set(false);
    }

    if (!target?.closest('.chat-message-actions')) {
      this.messageActionMenuId.set(null);
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.syncVoiceCarouselScrollState();
  }

  async signOut(): Promise<void> {
    this.isSigningOut.set(true);
    this.avatarMenuOpen.set(false);

    try {
      await this.authService.signOut();
      await this.router.navigateByUrl('/');
    } finally {
      this.isSigningOut.set(false);
    }
  }

  signInQueryParams(): { redirectTo: string } {
    return { redirectTo: this.publicRoute('chat') ?? this.router.url ?? '/chat' };
  }

  private publicRoute(segment: 'atlas' | 'chat' | 'upload' | 'library' | 'wiki'): string | null {
    if (!this.isPublicView()) {
      return null;
    }

    const atlas = this.publicAtlas();
    const slug = atlas?.slug?.trim() || this.routeSlug()?.trim() || atlas?.id;
    if (!slug) {
      return null;
    }

    return segment === 'atlas' ? `/atlas/${slug}` : `/${segment}/${slug}`;
  }

  private startThinkingRotation(): void {
    this.thinkingStage.set(0);
    this.thinkingInterval = setInterval(() => {
      this.thinkingStage.update((stage) => Math.min(stage + 1, THINKING_STAGES.length - 1));
    }, 1400);
  }

  private stopThinkingRotation(): void {
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = null;
    }
  }

  private asDate(value: { toDate(): Date } | Date | null | undefined): Date | null {
    return value instanceof Date ? value : typeof value?.toDate === 'function' ? value.toDate() : null;
  }

  private buildMessageCopyText(message: ChatMessage): string {
    const lines = [`${this.messageLabel(message)}:`, message.text.trim() || '(empty)'];

    if (message.citations?.length) {
      lines.push('');
      lines.push('Citations:');
      for (const citation of message.citations) {
        lines.push(`- ${citation.filename} p.${citation.page} (L${citation.line_start}-${citation.line_end})`);
      }
    }

    if (message.travelGuide?.cards.length) {
      lines.push('');
      lines.push('Guide cards:');
      for (const card of message.travelGuide.cards) {
        lines.push(`- ${card.title}: ${card.description}`);
      }
    }

    return lines.join('\n');
  }

  private questionBeforeMessage(messageId: string): string {
    const messages = this.messages();
    const index = messages.findIndex((message) => message.id === messageId);
    if (index <= 0) {
      return '';
    }

    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = messages[i];
      if (candidate?.role === 'user' && candidate.text.trim()) {
        return candidate.text.trim();
      }
    }
    return '';
  }

  historyTitle(item: ChatHistoryItem): string {
    return item.kind === 'thread' ? item.title : item.question;
  }

  historyUpdatedAt(item: ChatHistoryItem): { toDate(): Date } | Date | null | undefined {
    return item.updated_at ?? item.created_at;
  }

  historyTurnsLabel(item: ChatHistoryItem): string {
    if (item.kind === 'thread') {
      const turns = Math.max(1, item.user_turn_count || Math.ceil((item.message_count || 0) / 2));
      return `${turns} turn${turns === 1 ? '' : 's'}`;
    }
    return '1 turn';
  }

  private normalizeCitations(citations: CitationPassage[]): CitationPassage[] {
    const deduped = new Map<string, CitationPassage>();

    for (const citation of citations) {
      const normalized = {
        ...citation,
        filename: this.normalizeCitationFilename(citation.filename),
      };

      const key = [
        normalized.page,
        normalized.line_start,
        normalized.line_end,
        normalized.text.trim().toLowerCase(),
      ].join('::');

      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, normalized);
        continue;
      }

      const existingIsFallback = this.isFallbackCitationFilename(existing.filename);
      const candidateIsFallback = this.isFallbackCitationFilename(normalized.filename);

      if (existingIsFallback && !candidateIsFallback) {
        deduped.set(key, normalized);
      }
    }

    return Array.from(deduped.values());
  }

  private normalizeMappableLocations(locations: MappableLocation[]): MappableLocation[] {
    const deduped = new Map<string, MappableLocation>();

    for (const location of locations) {
      const name = location.name?.trim();
      const searchQuery = location.search_query?.trim();
      if (!name || !searchQuery) {
        continue;
      }

      const key = `${name.toLowerCase()}::${searchQuery.toLowerCase()}`;
      if (!deduped.has(key)) {
        deduped.set(key, {
          name,
          search_query: searchQuery,
          address_hint: location.address_hint?.trim() || null,
        });
      }
    }

    return Array.from(deduped.values()).slice(0, 6);
  }

  private normalizeTravelGuide(guide: TravelGuideStructuredResponse | null | undefined): TravelGuideStructuredResponse | null {
    if (!guide || !Array.isArray(guide.cards)) {
      return null;
    }

    const cards = guide.cards
      .map((card, index): TravelGuideCard | null => {
        const title = this.cleanTravelCardText(card.title ?? '');
        const description = this.cleanTravelCardText(card.description ?? '');
        if (!title || !description) {
          return null;
        }

        return {
          id: card.id?.trim() || `guide-card-${index + 1}`,
          title,
          subtitle: card.subtitle ? this.cleanTravelCardText(card.subtitle) || null : null,
          description,
          neighborhood: card.neighborhood ? this.cleanTravelCardText(card.neighborhood) || null : null,
          best_for: card.best_for ? this.cleanTravelCardText(card.best_for) || null : null,
          vibe: card.vibe ? this.cleanTravelCardText(card.vibe) || null : null,
          local_tip: card.local_tip ? this.cleanTravelCardText(card.local_tip) || null : null,
          cost: card.cost ? this.cleanTravelCardText(card.cost) || null : null,
          time_hint: card.time_hint ? this.cleanTravelCardText(card.time_hint) || null : null,
          image_url: card.image_url?.trim() || null,
          map_query: card.map_query?.trim() || null,
          source_url: card.source_url?.trim() || null,
        };
      })
      .filter((card): card is TravelGuideCard => !!card)
      .slice(0, 5);

    if (cards.length === 0) {
      return null;
    }

    return {
      title: guide.title?.trim() || null,
      summary: guide.summary?.trim() || null,
      cards,
      route: guide.route?.trim() || null,
      next_actions: (guide.next_actions ?? []).map((action) => action.trim()).filter(Boolean).slice(0, 4),
    };
  }

  travelCardStorageId(card: TravelGuideCard): string {
    return `${this.currentWikiAtlas()?.id ?? 'wiki'}:${card.id || card.title}`.toLowerCase();
  }

  private buildTravelCardShareText(card: TravelGuideCard): string {
    const lines = [
      card.title,
      card.subtitle,
      card.description,
      card.best_for ? `Best for: ${card.best_for}` : '',
      card.local_tip ? `Tip: ${card.local_tip}` : '',
      `Map: ${this.travelCardMapUrl(card)}`,
    ].filter(Boolean);
    return lines.join('\n');
  }

  private cleanTravelCardText(value: string): string {
    return value
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*#{1,6}\s*[^*#]+(?=\s+[-*+]\s+\*\*)/g, ' ')
      .replace(/(^|\s)#{1,6}\s*/g, '$1')
      .replace(/(^|\s)[*_]{1,3}([^*_]+)[*_]{1,3}(?=\s|$|[.,;:!?])/g, '$1$2')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/(^|\s)[-*+]\s+(?=\S)/g, '$1')
      .replace(/[*_]{1,3}/g, '')
      .replace(/\s+\*\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private loadSavedTravelCardIds(): Record<string, boolean> {
    if (typeof window === 'undefined') {
      return {};
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem('living-wiki:saved-travel-cards') ?? '{}') as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>)
          .filter(([, value]) => value === true),
      ) as Record<string, boolean>;
    } catch {
      return {};
    }
  }

  private persistSavedTravelCardIds(value: Record<string, boolean>): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem('living-wiki:saved-travel-cards', JSON.stringify(value));
  }

  private normalizeCitationFilename(filename: string | null | undefined): string {
    const value = String(filename ?? '').trim();
    if (!value || this.isFallbackCitationFilename(value)) {
      return 'Source document';
    }
    return value;
  }

  private isFallbackCitationFilename(filename: string): boolean {
    const normalized = filename.trim().toLowerCase();
    return normalized === 'unknown document' || normalized === 'source document' || normalized.startsWith('document ');
  }

  private withPdfPageAnchor(url: string, page?: number): string {
    if (!page || !/\.pdf([?#]|$)/i.test(url)) {
      return url;
    }

    const withoutHash = url.split('#')[0];
    return `${withoutHash}#page=${page}`;
  }

  private withCitationAnchor(url: string, citation: CitationPassage): string {
    if (/\.pdf([?#]|$)/i.test(url)) {
      return this.withPdfPageAnchor(url, citation.page);
    }

    return this.withTextFragment(url, citation.text);
  }

  private withTextFragment(url: string, text: string): string {
    const fragmentText = text
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .slice(0, 7)
      .join(' ');

    if (!fragmentText) {
      return url;
    }

    try {
      const parsed = new URL(url);
      parsed.hash = `:~:text=${encodeURIComponent(fragmentText)}`;
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private async copyText(target: string, text: string): Promise<void> {
    if (!text.trim() || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(text);
    this.copiedTarget.set(target);

    if (this.copyFeedbackTimeout) {
      clearTimeout(this.copyFeedbackTimeout);
    }

    this.copyFeedbackTimeout = setTimeout(() => {
      this.copiedTarget.set(null);
    }, 1800);
  }

  private ensureAnswerAudioUrl(message: ChatMessage, showLoading: boolean): Promise<string | null> {
    const cachedUrl = this.answerAudioUrls.get(message.id);
    if (cachedUrl) {
      this.preparedSpeechMessageIds.update((items) => ({ ...items, [message.id]: true }));
      return Promise.resolve(cachedUrl);
    }

    const pending = this.answerAudioPromises.get(message.id);
    if (pending) {
      if (showLoading) {
        this.loadingSpeechMessageId.set(message.id);
        pending.finally(() => {
          if (this.loadingSpeechMessageId() === message.id) {
            this.loadingSpeechMessageId.set(null);
          }
        });
      }
      return pending;
    }

    if (showLoading) {
      this.loadingSpeechMessageId.set(message.id);
    }

    const promise = this.chatService
      .synthesizeAnswerSpeech(
        message.text,
        this.questionBeforeMessage(message.id),
        this.isAnonymousPublicVisitor() ? this.ensureAnonymousVisitorId() : null,
      )
      .then((response) => {
        if (response?.audioUrl) {
          this.answerAudioUrls.set(message.id, response.audioUrl);
          this.preparedSpeechMessageIds.update((items) => ({ ...items, [message.id]: true }));
          return response.audioUrl;
        }
        if (response?.audioBase64) {
          const blob = this.audioBlobFromBase64(response.audioBase64, response.contentType || 'audio/mpeg');
          const audioUrl = URL.createObjectURL(blob);
          this.answerAudioUrls.set(message.id, audioUrl);
          this.preparedSpeechMessageIds.update((items) => ({ ...items, [message.id]: true }));
          return audioUrl;
        }
        throw new Error('No audio was returned for this answer.');
      })
      .catch((error) => {
        if (showLoading) {
          this.speechError.set(this.authService.toFriendlyError(error));
          this.speechErrorMessageId.set(message.id);
        }
        return null;
      })
      .finally(() => {
        this.answerAudioPromises.delete(message.id);
        if (this.loadingSpeechMessageId() === message.id) {
          this.loadingSpeechMessageId.set(null);
        }
      });

    this.answerAudioPromises.set(message.id, promise);
    return promise;
  }

  private prepareAnswerAudioPreview(messageId: string): void {
    const message = this.messages().find((item) => item.id === messageId);
    if (!message || message.pending || message.role !== 'assistant' || !message.text.trim()) {
      return;
    }

    void this.ensureAnswerAudioUrl(message, false);
  }

  private stopAnswerAudio(): void {
    if (this.answerAudio) {
      this.answerAudio.pause();
      this.answerAudio.currentTime = 0;
      this.answerAudio.onended = null;
      this.answerAudio.onerror = null;
      this.answerAudio = null;
    }
    this.playingSpeechMessageId.set(null);
  }

  private clearSpeechState(revokeUrls = false): void {
    this.stopAnswerAudio();
    this.loadingSpeechMessageId.set(null);
    this.speechErrorMessageId.set(null);
    this.speechError.set(null);

    if (!revokeUrls) {
      return;
    }

    this.answerAudioPromises.clear();
    for (const audioUrl of this.answerAudioUrls.values()) {
      if (audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl);
      }
    }
    this.answerAudioUrls.clear();
  }

  private audioBlobFromBase64(audioBase64: string, contentType: string): Blob {
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: contentType });
  }

  private captureScrollPosition(): {
    windowY: number;
    documentY: number;
    bodyY: number;
    viewportTop: number | null;
  } | null {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return null;
    }

    return {
      windowY: window.scrollY,
      documentY: document.documentElement.scrollTop,
      bodyY: document.body.scrollTop,
      viewportTop: this.chatScrollViewport?.nativeElement.scrollTop ?? null,
    };
  }

  private restoreScrollPosition(position: {
    windowY: number;
    documentY: number;
    bodyY: number;
    viewportTop: number | null;
  } | null): void {
    if (!position || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const restore = () => {
      this.shouldScrollToEnd = false;
      const viewport = this.chatScrollViewport?.nativeElement;
      if (viewport && position.viewportTop !== null) {
        viewport.scrollTop = position.viewportTop;
      }
      window.scrollTo({ top: position.windowY, left: window.scrollX, behavior: 'auto' });
      document.documentElement.scrollTop = position.documentY;
      document.body.scrollTop = position.bodyY;
    };

    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 50);
    setTimeout(restore, 250);
  }

  private lockScrollPosition(position: ReturnType<ChatComponent['captureScrollPosition']>): void {
    if (!position) {
      return;
    }

    this.restoreScrollPosition(position);
    if (this.voiceScrollLockTimer) {
      return;
    }

    this.voiceScrollLockTimer = setInterval(() => {
      this.restoreScrollPosition(position);
    }, 40);
  }

  private unlockScrollPosition(position: ReturnType<ChatComponent['captureScrollPosition']>): void {
    if (this.voiceScrollLockTimer) {
      clearInterval(this.voiceScrollLockTimer);
      this.voiceScrollLockTimer = null;
    }
    this.restoreScrollPosition(position);
    this.voiceClickScrollPosition = null;
  }

  private buildShareUrl(threadId: string): string {
    const path = `/chat/shared/${encodeURIComponent(threadId)}`;
    const configuredBaseUrl = typeof window !== 'undefined' ? getPublicAppUrl() : null;
    const baseUrl = configuredBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${baseUrl}${path}`;
  }

  private buildAnswerCardShareUrl(cardId: string): string {
    const configuredBaseUrl = typeof window !== 'undefined' ? getPublicAppUrl() : null;
    const baseUrl = configuredBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${baseUrl}/share/answer-card/${encodeURIComponent(cardId)}`;
  }

  private mapStoredMessage(message: ChatStoredMessage): ChatMessage {
    return {
      id: message.id,
      role: message.role,
      text: message.text,
      html: message.role === 'assistant' ? formatAssistantMessageHtml(message.text) : undefined,
      answerMode: message.answer_mode === 'internet' ? 'internet' : 'wiki',
      citations: this.normalizeCitations(message.cited_passages ?? []),
      mappableLocations: this.normalizeMappableLocations(message.mappable_locations ?? []),
      travelGuide: this.normalizeTravelGuide(message.travel_guide ?? null),
      answerCardId: message.answer_card_id ?? null,
      answerQuizId: message.answer_quiz_id ?? null,
      knowledgeGap: !!message.knowledge_gap,
      createdAt: message.created_at,
      updatedAt: message.created_at,
    };
  }

  private syncArtifactLinksFromMessages(messages: ChatMessage[]): void {
    const answerCardLinks: Record<string, string> = {};
    const quizLinks: Record<string, string> = {};

    for (const message of messages) {
      if (message.role !== 'assistant') {
        continue;
      }
      if (message.answerCardId) {
        answerCardLinks[message.id] = `/answer-card/${message.answerCardId}`;
      }
      if (message.answerQuizId) {
        quizLinks[message.id] = `/quiz/${message.answerQuizId}`;
      }
    }

    this.answerCardLinks.set(answerCardLinks);
    this.quizLinks.set(quizLinks);
  }

  private syncAnswerModeFromMessages(messages: ChatMessage[]): void {
    if (!this.canUseAnswerModeToggle()) {
      this.answerMode.set('internet');
      return;
    }

    const assistantMessage = [...messages].reverse().find((message) => message.role === 'assistant');
    if (!assistantMessage) {
      this.answerMode.set(this.defaultAnswerMode(this.currentWikiAtlas()));
      return;
    }

    this.answerMode.set(assistantMessage.answerMode === 'internet' ? 'internet' : 'wiki');
  }

  private defaultAnswerMode(atlas: AtlasItem | null | undefined): 'wiki' | 'internet' {
    return atlas?.default_answer_mode === 'internet' ? 'internet' : 'wiki';
  }

  private resetPublicChatState(): void {
    this.publicChatLoading.set(false);
    this.publicLoadError.set(null);
    this.publicQuestionLimit.set(null);
    this.publicRemainingQuestions.set(null);
    this.publicRequiresSignIn.set(false);
  }

  private async loadSidebarCityWikis(): Promise<void> {
    const comingSoon = COMING_SOON_PUBLIC_WIKIS.filter((wiki) => wiki.category === CITY_WIKI_CATEGORY);
    try {
      const liveWikis = sortPublicAtlases(await this.atlasService.listPublicAtlases())
        .map((atlas) => buildPublicWikiLiveItem(atlas))
        .filter((wiki) => wiki.category === CITY_WIKI_CATEGORY);
      this.publicCityWikis.set([
        ...liveWikis,
        ...removeCreatedPublicWikiPreviews(liveWikis, comingSoon),
      ]);
    } catch {
      this.publicCityWikis.set(comingSoon);
    }
  }

  private loadAnonymousVisitorId(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem('living-wiki:publicVisitorId');
  }

  private ensureAnonymousVisitorId(): string | null {
    const existing = this.anonymousVisitorId();
    if (existing) {
      return existing;
    }
    if (typeof window === 'undefined' || typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
      return null;
    }

    const next = crypto.randomUUID();
    window.localStorage.setItem('living-wiki:publicVisitorId', next);
    this.anonymousVisitorId.set(next);
    return next;
  }

  private async goToSignIn(): Promise<void> {
    await this.router.navigate(['/sign-in'], { queryParams: this.signInQueryParams() });
  }
}
