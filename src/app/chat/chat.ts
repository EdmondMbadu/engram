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
import {
  BusinessClaimService,
  type BusinessClaimRegistryRecord,
} from '../business-claim/business-claim.service';
import { MobileMenuComponent } from '../mobile-menu/mobile-menu';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';
import { ChatLocationMapComponent } from '../chat-location-map/chat-location-map';
import { AccountMenuComponent } from '../account-menu/account-menu';
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

interface IpLanguageLocation {
  countryCode: string | null;
  countryName: string | null;
  source: 'ip' | 'browser' | 'fallback';
}

interface IpApiLocationResponse {
  country_code?: string | null;
  country_name?: string | null;
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

const IP_LANGUAGE_LOCATION_CACHE_KEY = 'livingWiki.ipLanguageLocation.v1';
const IP_LANGUAGE_LOCATION_URL = 'https://ipapi.co/json/';

const COUNTRY_CODE_TO_VOICE_COUNTRY: Record<string, string> = {
  DZ: 'Algeria',
  AR: 'Argentina',
  AU: 'Australia',
  AT: 'Austria',
  BE: 'Belgium',
  BA: 'Bosnia & Herzegovina',
  BR: 'Brazil',
  CA: 'Canada',
  CV: 'Cape Verde',
  CO: 'Colombia',
  HR: 'Croatia',
  CW: 'Curaçao',
  CZ: 'Czechia',
  CD: 'DR Congo',
  EC: 'Ecuador',
  EG: 'Egypt',
  GB: 'England',
  FR: 'France',
  DE: 'Germany',
  GH: 'Ghana',
  HT: 'Haiti',
  IR: 'Iran',
  IQ: 'Iraq',
  CI: 'Ivory Coast',
  JP: 'Japan',
  JO: 'Jordan',
  MX: 'Mexico',
  MA: 'Morocco',
  NL: 'Netherlands',
  NZ: 'New Zealand',
  NO: 'Norway',
  PA: 'Panama',
  PY: 'Paraguay',
  PT: 'Portugal',
  QA: 'Qatar',
  SA: 'Saudi Arabia',
  SN: 'Senegal',
  ZA: 'South Africa',
  KR: 'South Korea',
  ES: 'Spain',
  SE: 'Sweden',
  CH: 'Switzerland',
  TN: 'Tunisia',
  TR: 'Türkiye',
  UY: 'Uruguay',
  US: 'United States',
  UZ: 'Uzbekistan',
  CN: 'China',
  RU: 'Russia',
  IN: 'India',
};

const COUNTRY_NAME_TO_CODE = Object.entries(COUNTRY_CODE_TO_VOICE_COUNTRY).reduce<Record<string, string>>(
  (map, [code, country]) => {
    map[country.toLowerCase()] = code;
    return map;
  },
  {},
);

const COUNTRY_CODE_TO_VOICE_LANGUAGE: Partial<Record<string, VoiceLanguageCode>> = {
  AE: 'ar',
  AF: 'fa',
  BG: 'bg',
  DK: 'da',
  FI: 'fi',
  GR: 'el',
  HU: 'hu',
  ID: 'id',
  IT: 'it',
  KE: 'sw',
  MY: 'ms',
  NG: 'en',
  PH: 'tl',
  PL: 'pl',
  RO: 'ro',
  RS: 'sr',
  SK: 'sk',
  TH: 'th',
  UA: 'uk',
  VN: 'vi',
};

type ChatUiTextKey = string;

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
  { country: 'Australia', flag: '🇦🇺', language: 'English', code: 'en', greeting: 'G’day! I’m the Living Wiki voice guide. Ask me anything.' },
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
  { country: 'Canada', flag: '🇨🇦', language: 'English', code: 'en', greeting: 'Hey! I’m the Living Wiki voice guide. What would you like to know?' },
  { country: 'Cape Verde', flag: '🇨🇻', language: 'Português', code: 'pt', greeting: 'Olá! Sou o seu guia de voz. Pergunte o que quiser.' },
  { country: 'Colombia', flag: '🇨🇴', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras.' },
  { country: 'Croatia', flag: '🇭🇷', language: 'Hrvatski', code: 'hr', greeting: 'Bok! Ja sam tvoj glasovni vodič. Pitaj me bilo što i odgovorit ću naglas.' },
  { country: 'Curaçao', flag: '🇨🇼', language: 'Nederlands', code: 'nl', greeting: 'Hallo! Ik ben je spraakgids. Stel me een vraag en ik antwoord hardop.' },
  { country: 'Czechia', flag: '🇨🇿', language: 'Čeština', code: 'cs', greeting: 'Ahoj! Jsem tvůj hlasový průvodce. Zeptej se mě na cokoliv.' },
  { country: 'DR Congo', flag: '🇨🇩', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Posez-moi toutes vos questions.' },
  { country: 'Ecuador', flag: '🇪🇨', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. ¿Cómo puedo ayudarte?' },
  { country: 'Egypt', flag: '🇪🇬', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عن أي شيء.' },
  { country: 'England', flag: '🏴', language: 'English', code: 'en', greeting: 'Hello! I’m the Living Wiki voice guide. Ask me anything.' },
  { country: 'France', flag: '🇫🇷', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Posez-moi vos questions, j’y réponds à voix haute.' },
  { country: 'Germany', flag: '🇩🇪', language: 'Deutsch', code: 'de', greeting: 'Hallo! Ich bin dein Sprachassistent. Stell mir eine Frage und ich antworte dir laut.' },
  { country: 'Ghana', flag: '🇬🇭', language: 'English', code: 'en', greeting: 'Hello! I’m the Living Wiki voice guide. How can I help you today?' },
  { country: 'Haiti', flag: '🇭🇹', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Comment puis-je vous aider ?' },
  { country: 'Iran', flag: '🇮🇷', language: 'فارسی', code: 'fa', greeting: 'سلام! من راهنمای صوتی شما هستم. هر چه می‌خواهید بپرسید.' },
  { country: 'Iraq', flag: '🇮🇶', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. كيف يمكنني مساعدتك؟' },
  { country: 'Ivory Coast', flag: '🇨🇮', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Comment puis-je vous aider ?' },
  { country: 'Japan', flag: '🇯🇵', language: '日本語', code: 'ja', greeting: 'こんにちは！私はあなたの音声ガイドです。何でも聞いてください。' },
  { country: 'Jordan', flag: '🇯🇴', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عمّا تريد.' },
  { country: 'Mexico', flag: '🇲🇽', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras y te respondo en voz alta.' },
  { country: 'Morocco', flag: '🇲🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. كيف يمكنني مساعدتك؟' },
  { country: 'Netherlands', flag: '🇳🇱', language: 'Nederlands', code: 'nl', greeting: 'Hallo! Ik ben je spraakgids. Stel me een vraag en ik antwoord hardop.' },
  { country: 'New Zealand', flag: '🇳🇿', language: 'English', code: 'en', greeting: 'Kia ora! I’m the Living Wiki voice guide. Ask me anything.' },
  { country: 'Norway', flag: '🇳🇴', language: 'Norsk', code: 'no', greeting: 'Hei! Jeg er din stemmeguide. Spør meg om hva som helst.' },
  { country: 'Panama', flag: '🇵🇦', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras.' },
  { country: 'Paraguay', flag: '🇵🇾', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Estoy aquí para responder tus preguntas.' },
  { country: 'Portugal', flag: '🇵🇹', language: 'Português', code: 'pt', greeting: 'Olá! Sou o seu guia de voz. Pergunte o que quiser.' },
  { country: 'Qatar', flag: '🇶🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عمّا تريد.' },
  { country: 'Saudi Arabia', flag: '🇸🇦', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. اسألني عن أي شيء.' },
  { country: 'Scotland', flag: '🏴', language: 'English', code: 'en', greeting: 'Hello! I’m the Living Wiki voice guide. Ask me anything.' },
  { country: 'Senegal', flag: '🇸🇳', language: 'Français', code: 'fr', greeting: 'Bonjour ! Je suis votre guide vocal. Posez-moi toutes vos questions.' },
  { country: 'South Africa', flag: '🇿🇦', language: 'English', code: 'en', greeting: 'Hi! I’m the Living Wiki voice guide. Ask me anything.' },
  { country: 'South Korea', flag: '🇰🇷', language: '한국어', code: 'ko', greeting: '안녕하세요! 저는 음성 가이드입니다. 무엇이든 물어보세요.' },
  { country: 'Spain', flag: '🇪🇸', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. Pregúntame lo que quieras.' },
  { country: 'Sweden', flag: '🇸🇪', language: 'Svenska', code: 'sv', greeting: 'Hej! Jag är din röstguide. Fråga mig vad du vill.' },
  { country: 'Switzerland', flag: '🇨🇭', language: 'Deutsch', code: 'de', greeting: 'Hallo! Ich bin dein Sprachassistent. Wie kann ich dir helfen?' },
  { country: 'Tunisia', flag: '🇹🇳', language: 'العربية', code: 'ar', greeting: 'مرحباً! أنا دليلك الصوتي. تفضّل بالسؤال.' },
  { country: 'Türkiye', flag: '🇹🇷', language: 'Türkçe', code: 'tr', greeting: 'Merhaba! Ben senin sesli rehberinim. Bana istediğini sorabilirsin.' },
  { country: 'Uruguay', flag: '🇺🇾', language: 'Español', code: 'es', greeting: '¡Hola! Soy tu guía de voz. ¿Qué te gustaría saber?' },
  { country: 'United States', flag: '🇺🇸', language: 'English', code: 'en', greeting: 'Hi there! I’m the Living Wiki voice guide. Ask me anything and I’ll answer out loud.' },
  { country: 'Uzbekistan', flag: '🇺🇿', language: 'Русский', code: 'ru', greeting: 'Здравствуйте! Я ваш голосовой гид. Спрашивайте меня о чём угодно.' },
  { country: 'China', flag: '🇨🇳', language: '中文（普通话）', code: 'zh', greeting: '你好！我是你的语音向导。有什么问题都可以问我。' },
  { country: 'Russia', flag: '🇷🇺', language: 'Русский', code: 'ru', greeting: 'Здравствуйте! Я ваш голосовой гид. Спрашивайте меня о чём угодно.' },
  { country: 'India', flag: '🇮🇳', language: 'हिन्दी', code: 'hi', greeting: 'नमस्ते! मैं आपका वॉइस गाइड हूँ। मुझसे कुछ भी पूछिए।' },
];

@Component({
  selector: 'app-chat',
  imports: [
    FormsModule,
    RouterLink,
    ThemeToggleComponent,
    MobileMenuComponent,
    ChatLocationMapComponent,
    AccountMenuComponent,
  ],
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
  private readonly businessClaimService = inject(BusinessClaimService);
  private readonly route = inject(ActivatedRoute);

  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);
  readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );
  readonly routeBusinessSlug = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('business')?.trim() || null)),
    { initialValue: this.route.snapshot.queryParamMap.get('business')?.trim() || null },
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
  private voiceLanguageUserSelected = false;
  private voiceLanguageDetectionStarted = false;

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
  readonly businessVoiceLanguages = computed(() => {
    const filtered = this.filteredVoiceLanguages();
    const selected = this.selectedVoiceLanguage();
    if (!selected || filtered.some((language) => this.voiceLanguageMatches(language, selected))) {
      return filtered;
    }
    return [selected, ...filtered];
  });
  readonly businessActiveVoiceLanguage = computed(() => this.selectedVoiceLanguage() ?? this.businessVoiceLanguages()[0] ?? null);
  readonly businessVoiceGreeting = computed(() => {
    const language = this.businessActiveVoiceLanguage();
    return language
      ? this.voiceSessionGreeting(language)
      : `Choose a language to speak with ${this.businessPageName()}.`;
  });
  readonly businessVoiceCta = computed(() => {
    const language = this.businessActiveVoiceLanguage();
    return language ? this.uiText('startVoiceModeIn', { language: language.language }) : 'Start voice';
  });
  readonly voiceCarouselAtStart = signal(true);
  readonly voiceCarouselAtEnd = signal(false);
  readonly businessVoiceAtStart = signal(true);
  readonly businessVoiceAtEnd = signal(false);
  readonly selectedVoiceLanguage = signal<VoiceLanguageOption | null>(null);
  readonly detectedVoiceLanguageLocation = signal<IpLanguageLocation | null>(null);
  readonly voiceLanguageAutoSelected = signal(false);
  readonly selectedVoiceLanguageGreeting = computed(() => {
    const language = this.selectedVoiceLanguage();
    return language
      ? this.voiceSessionGreeting(language)
      : this.uiText('chooseLanguagePrompt', { city: this.currentWikiName() || 'this City Wiki' });
  });
  readonly selectedVoiceLanguageCta = computed(() => {
    const language = this.selectedVoiceLanguage();
    return language
      ? this.uiText('startVoiceModeIn', { language: language.language })
      : this.uiText('selectFlagFirst');
  });
  readonly selectedPageLanguageCode = computed(() => this.selectedVoiceLanguage()?.code ?? 'en');
  readonly pageTextDirection = computed(() => {
    const code = this.selectedPageLanguageCode();
    return code === 'ar' || code === 'fa' ? 'rtl' : 'ltr';
  });
  readonly voiceLanguageHint = computed(() => {
    const language = this.selectedVoiceLanguage();
    const location = this.detectedVoiceLanguageLocation();
    if (language && this.voiceLanguageAutoSelected()) {
      return this.uiText('voiceHintAuto', {
        count: String(this.filteredVoiceLanguages().length),
        country: this.localizedCountryName(location?.countryName || language.country),
      });
    }
    return this.uiText('voiceHintManual', { count: String(this.filteredVoiceLanguages().length) });
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
  readonly businessClaim = signal<BusinessClaimRegistryRecord | null>(null);
  readonly businessClaimLookupDone = signal(false);
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
  readonly businessPageContext = computed(() => !!this.routeBusinessSlug());
  readonly businessPageName = computed(() =>
    this.businessClaim()?.business_name?.trim()
    || this.titleizeSlug(this.routeBusinessSlug() || 'business'),
  );
  readonly businessPageCityName = computed(() => this.businessClaim()?.city_name?.trim() || this.currentWikiName());
  readonly businessPageInitial = computed(() => this.businessPageName().trim().charAt(0).toUpperCase() || 'B');
  readonly businessPageStatus = computed(() => this.businessClaim()?.status ?? (this.businessPageContext() && !this.businessClaimLookupDone() ? 'pending' : null));
  readonly businessPagePending = computed(() => this.businessPageStatus() === 'pending');
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
    () => !this.businessPageContext() && this.canStartRealtimeVoice() && this.currentWikiAtlas()?.city_config?.enabled === true,
  );
  readonly realtimeVoiceActive = computed(() => {
    const status = this.realtimeVoiceStatus();
    return status === 'connecting' || status === 'connected' || status === 'disconnecting';
  });
  readonly realtimeVoiceOrbState = computed(() => {
    if (this.realtimeVoiceStatus() === 'connecting') return this.uiText('connecting');
    if (this.realtimeVoiceStatus() === 'error') return this.uiText('needsAttention');
    if (this.realtimeVoiceStatus() === 'disconnected') return this.uiText('ready');
    return this.realtimeVoiceMode() === 'speaking' ? this.uiText('speaking') : this.uiText('listening');
  });
  readonly realtimeVoicePrimaryLabel = computed(() => {
    const status = this.realtimeVoiceStatus();
    if (status === 'connecting') return this.uiText('connecting');
    if (status === 'disconnecting') return this.uiText('ending');
    if (status === 'connected') return this.uiText('endVoice');
    return this.uiText('voiceMode');
  });
  readonly realtimeVoicePanelTitle = computed(() => {
    const status = this.realtimeVoiceStatus();
    if (status === 'connecting') return this.uiText('connectingRealtimeVoice');
    if (status === 'connected') {
      return this.realtimeVoiceMode() === 'speaking' ? this.uiText('aiSpeaking') : this.uiText('listening');
    }
    if (status === 'disconnecting') return this.uiText('endingVoiceMode');
    if (status === 'error') return this.uiText('voiceModeNeedsSetup');
    return this.uiText('realtimeVoiceReady');
  });
  readonly realtimeVoiceGreeting = computed(() =>
    this.voiceSessionGreeting(this.selectedVoiceLanguage() ?? undefined),
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
  @ViewChild('businessVoiceLanguageTrack') businessVoiceLanguageTrack?: ElementRef<HTMLElement>;

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly isPlatformAdmin = this.authService.isAdmin;
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
  readonly currentThinkingLabel = computed(() => {
    const keys = ['thinkingSearch', 'thinkingRead', 'thinkingSynthesize'];
    return this.uiText(keys[this.thinkingStage()] ?? keys[0]);
  });
  readonly pageTitle = computed(() =>
    this.businessPageContext()
      ? `${this.businessPageName()} | Living Wiki`
      : this.isPublicView()
      ? this.uiText('chatTitle', { city: this.atlasService.displayName(this.publicAtlas()) })
      : this.uiText('chat'),
  );
  readonly pageSubtitle = computed(() => {
    if (this.isWorkspaceMode()) {
      return '';
    }
    if (this.showSignInCta()) {
      return this.uiText('publicLimitReached');
    }
    if (this.isAnonymousPublicVisitor()) {
      return this.uiText('askFiveNoSignIn');
    }
    if (this.isSignedInPublicVisitor()) {
      return this.uiText('signedInVisitorsFree');
    }
    return this.uiText('askPublicAtlas');
  });
  readonly composerPlaceholder = computed(() =>
    this.canUseAnswerModeToggle()
      ? this.isInternetMode()
        ? this.localInternetPlaceholder()
        : this.uiText('messageLivingWiki')
      : this.showSignInCta()
        ? `${this.uiText('signInToContinue')}...`
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
      return this.uiText('publicLimitNotice');
    }
    if (this.isAnonymousPublicVisitor()) {
      const remaining = this.publicRemainingQuestions();
      return remaining === null
        ? this.uiText('askFiveNoSignInPeriod')
        : this.uiText('remainingQuestions', { count: `${remaining}` });
    }
    return this.uiText('subscribeNotice');
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
    return name.replace(/^Living Wiki:\s*/i, '').replace(/\s*\(flagship\)\s*$/i, '').trim();
  });
  readonly currentWikiCountry = computed(() => this.localizedCountryName(this.atlasService.cityCountryLabel(this.currentWikiAtlas()) ?? ''));
  readonly canShowPlaceReviews = computed(() => {
    const atlas = this.currentWikiAtlas();
    return !!atlas?.id && atlas.city_config?.enabled === true && !this.publicNotFound();
  });
  readonly reviewedPlacesCountLabel = computed(() => {
    const count = this.reviewedPlaces().length;
    return this.uiText(count === 1 ? 'reviewedPlaceCount' : 'reviewedPlacesCount', { count: `${count}` });
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
    return name ? this.uiText('askCitySources', { city: name }) : this.uiText('askSources');
  });
  readonly emptyStateEyebrow = computed(() => {
    if (this.canUseAnswerModeToggle()) {
      return this.isInternetMode() ? this.uiText('internetModeLabel') : this.uiText('myLivingWikiLabel');
    }
    return this.uiText('internetModeLabel');
  });
  readonly emptyStateTitle = computed(() => {
    const name = this.currentWikiName();
    if (this.isWorkspaceMode()) {
      return name ? this.uiText('askAtlasInternet', { city: name }) : this.uiText('askYourWiki');
    }
    if (this.showSignInCta()) {
      return this.uiText('signInKeepChatting');
    }
    return name ? this.uiText('askAtlasInternet', { city: name }) : this.uiText('askThisWiki');
  });
  readonly emptyStateDescription = computed(() => {
    if (this.canUseAnswerModeToggle()) {
      return this.isInternetMode()
        ? this.uiText('internetModeDescription')
        : this.currentWikiSummary();
    }
    if (!this.hasWikiDocuments()) {
      return this.uiText('noSourcesDescription');
    }
    if (this.showSignInCta()) {
      return this.uiText('publicLimitUsed');
    }
    if (this.isAnonymousPublicVisitor()) {
      const remaining = this.publicRemainingQuestions();
      const base = this.currentWikiSummary();
      const limitNote = remaining === null
        ? this.uiText('anonymousQuestionsAllowed')
        : this.uiText('anonymousQuestionsLeft', { count: `${remaining}` });
      return `${base} ${limitNote}`;
    }
    return this.currentWikiSummary();
  });
  readonly heroPromptText = computed(() => {
    if (this.businessPageContext()) {
      return this.businessPagePending()
        ? `${this.businessPageName()} has been submitted and is pending review. This QR link is reserved for the business page.`
        : `Ask ${this.businessPageName()}'s Living Wiki guide about this business and the surrounding city.`;
    }

    if (this.showSignInCta()) {
      return this.uiText('signInGroundedQuestions');
    }

    if (!this.hasWikiDocuments() || (this.canUseAnswerModeToggle() && this.isInternetMode())) {
      return this.uiText('heroInternetPrompt');
    }

    const name = this.currentWikiName();
    if (name) {
      return this.uiText('heroCitySourcesPrompt', { city: name });
    }

    return this.uiText('heroWikiSourcesPrompt');
  });
  readonly heroSupportingText = computed(() => {
    if (this.showSignInCta()) {
      return this.uiText('signInKeepConversation');
    }

    if (!this.hasWikiDocuments() || (this.canUseAnswerModeToggle() && this.isInternetMode())) {
      return this.uiText('heroInternetSupporting');
    }

    const name = this.currentWikiName();
    if (name) {
      return this.uiText('heroCityIndexed', { city: name });
    }

    return this.uiText('heroIndexed');
  });
  readonly heroStatusLabel = computed(() => (this.isPublicVisitorMode() ? this.uiText('publicAtlasLive') : this.uiText('myLivingWikiLive')));
  readonly heroMetaLabel = computed(() => {
    if (this.hidePublicKnowledgeSurfaces()) {
      return this.uiText('knowledgeReady');
    }

    if (this.showSignInCta()) {
      return this.uiText('anonymousSessionPaused');
    }

    if (!this.hasWikiDocuments() || (this.canUseAnswerModeToggle() && this.isInternetMode())) {
      return this.uiText('internetModeEnabled');
    }

    const total = this.currentWikiSourceCount();
    return this.uiText(total === 1 ? 'oneIndexedSource' : 'manyIndexedSources', { count: `${total}` });
  });
  readonly composerHelperText = computed(() => {
    if (!this.hasWikiDocuments()) {
      return this.uiText('internetNoDocumentsHelper');
    }

    if (this.canUseAnswerModeToggle()) {
      return this.isInternetMode()
        ? this.uiText('internetModeHelper')
        : this.uiText('wikiModeHelper');
    }
    if (this.showSignInCta()) {
      return this.uiText('publicLimitUsed');
    }
    if (this.isAnonymousPublicVisitor()) {
      const remaining = this.publicRemainingQuestions();
      return remaining === null
        ? this.uiText('askFiveNoSignInPeriod')
        : this.uiText('anonymousQuestionsRemaining', { count: `${remaining}` });
    }
    return this.uiText('savedWithNameEmail');
  });

  private cachedPromptsKey: string | null = null;
  private cachedPrompts: PromptSuggestion[] = [];

  readonly quickPrompts = computed<PromptSuggestion[]>(() => {
    if (this.publicNotFound()) {
      return [];
    }

    const atlasName = this.currentWikiName() || this.uiText('askThisWiki').toLowerCase();
    if (this.isInternetMode()) {
      return [
        {
          title: this.uiText('latestUpdates'),
          prompt: this.uiText('latestUpdatesPrompt', { city: atlasName }),
          detail: this.uiText('latestUpdatesDetail'),
          icon: 'public',
        },
        {
          title: this.uiText('whatMattersNow'),
          prompt: this.uiText('whatMattersNowPrompt', { city: atlasName }),
          detail: this.uiText('whatMattersNowDetail'),
          icon: 'bolt',
        },
        {
          title: this.uiText('recentDebates'),
          prompt: this.uiText('recentDebatesPrompt', { city: atlasName }),
          detail: this.uiText('recentDebatesDetail'),
          icon: 'forum',
        },
        {
          title: this.uiText('backgroundContext'),
          prompt: this.uiText('backgroundContextPrompt', { city: atlasName }),
          detail: this.uiText('backgroundContextDetail'),
          icon: 'travel_explore',
        },
      ];
    }

    const topics = this.wikiService.topics();
    const articles = this.wikiService.articles();
    const atlasId = this.isPublicView()
      ? this.publicAtlas()?.id ?? this.routeSlug() ?? ''
      : this.atlasService.activeAtlasId() ?? '';
    const cacheKey = `${this.selectedPageLanguageCode()}::${atlasId}::${topics.length}::${articles.length}`;
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
            this.uiText('whatIsTopic', { topic: label }),
            this.uiText('whyTopicMatters', { topic: label }),
            this.uiText('keyFactsTopic', { topic: label }),
            this.uiText('topicConnection', { topic: label, city: atlasName }),
          ][i % 4],
          detail: i % 2 === 0 ? this.uiText('groundedWikiDetail') : this.uiText('knowledgeBaseDetail'),
          icon: i % 2 === 0 ? 'auto_stories' : 'explore',
        }))
      : [
          {
            title: this.uiText('quickOverview'),
            prompt: this.uiText('quickOverviewPrompt', { city: atlasName }),
            detail: this.uiText('quickOverviewDetail'),
            icon: 'dashboard',
          },
          {
            title: this.uiText('importantTopics'),
            prompt: this.uiText('importantTopicsPrompt', { city: atlasName }),
            detail: this.uiText('importantTopicsDetail'),
            icon: 'menu_book',
          },
          {
            title: this.uiText('bestStartingPoint'),
            prompt: this.uiText('bestStartingPointPrompt', { city: atlasName }),
            detail: this.uiText('bestStartingPointDetail'),
            icon: 'flag',
          },
          {
            title: this.uiText('keyQuestions'),
            prompt: this.uiText('keyQuestionsPrompt', { city: atlasName }),
            detail: this.uiText('keyQuestionsDetail'),
            icon: 'help',
          },
        ];

    this.cachedPromptsKey = cacheKey;
    this.cachedPrompts = built;
    return built;
  });

  cityWikiRouterLink(wiki: PublicWikiCatalogItem): string | string[] {
    return wiki.status === 'live' && wiki.slug ? ['/chat', wiki.slug] : '/public-wikis';
  }

  cityWikiStatusLabel(wiki: PublicWikiCatalogItem): string {
    return wiki.status === 'live' ? this.uiText('live') : this.uiText('preview');
  }

  cityWikiLocationLabel(wiki: PublicWikiCatalogItem): string {
    return wiki.title.replace(/^Living Wiki:\s*/i, '').trim();
  }

  private localInternetPlaceholder(): string {
    const name = this.currentWikiName();
    if (!name) {
      return this.uiText('askAtlasInternet');
    }
    return this.uiText('askCityInternet', { city: name });
  }

  uiText(
    key: ChatUiTextKey,
    params: Record<string, string> = {},
  ): string {
    const code = this.selectedPageLanguageCode();
    const family = code === 'pt-br' ? 'pt' : code;
    const dictionaries: Partial<Record<string, Partial<Record<ChatUiTextKey, string>>>> = {
      en: {
        weSpeakYourLanguage: 'We speak your language',
        voiceHintManual: '{count} countries · choose a flag first.',
        voiceHintAuto: '{count} countries · selected for {country}.',
        findCountry: 'Find country',
        clearCountrySearch: 'Clear country search',
        previousLanguages: 'Previous languages',
        moreLanguages: 'More languages',
        choose: 'Choose',
        noMatchingLanguage: 'No matching country or language.',
        chooseLanguagePrompt: 'Choose a flag to switch {city} into your language.',
        selectFlagFirst: 'Select a flag first',
        speakInLanguage: 'Speak to me in {language}',
        language: 'Language',
        voiceModeSelected: 'Voice mode selected',
        startVoiceModeIn: 'Start voice mode in {language}',
        loadingChat: 'Loading chat',
        preparingConversation: 'Preparing this atlas conversation.',
        emailAddress: 'Email address',
        joining: 'Joining...',
        joinForFree: 'Join for free',
        weeklyUpdates: 'Weekly updates and staying in the know.',
        askLivingWiki: 'Ask Living Wiki',
        guideAlt: 'Living Wiki guide',
        answerMode: 'Answer mode',
        wiki: 'Wiki',
        internet: 'Internet',
        toSend: 'to send',
        signInToContinue: 'Sign in to continue',
        sendMessage: 'Send message',
        suggestedQuestions: 'Suggested questions',
        signInToSaveChat: 'Sign in to save chat',
        subscribeWeeklyUpdates: 'Subscribe to weekly updates',
        reviewedLocations: 'Reviewed locations',
        trendingNow: 'Trending now',
        openPlacesBoard: 'Open places board',
        noLocalReviewsYet: 'No local reviews yet',
        openBoardFirstPlace: 'Open the board to add the first place.',
        newChat: 'New Chat',
        exploreCities: 'Explore cities',
        publicLivingWikis: 'Public living wikis',
        seeAll: 'See all',
        signIn: 'Sign in',
        subscribe: 'Subscribe',
        messageLivingWiki: 'Message Living Wiki...',
        publicLimitReached: 'Public question limit reached',
        askFiveNoSignIn: 'Ask up to 5 questions without signing in',
        signedInVisitorsFree: 'Signed-in visitors can chat freely with this atlas',
        askPublicAtlas: 'Ask questions about this public atlas',
        publicLimitNotice: 'You have reached the 5-question public limit. Sign in to continue this conversation.',
        askFiveNoSignInPeriod: 'Ask up to 5 questions without signing in.',
        remainingQuestions: 'Ask up to 5 questions without signing in. {count} remaining.',
        subscribeNotice: 'Subscribe for weekly updates from this Wiki.',
        askAtlasInternet: 'Ask about news, places, jobs, events, and civic life...',
        askCityInternet: 'Ask about {city} news, neighborhoods, transit, food, jobs, safety, events, and civic life...',
        askCitySources: 'Ask {city} anything from your sources.',
        askSources: 'Ask anything from your sources.',
        internetModeLabel: 'Internet mode',
        myLivingWikiLabel: 'Living Wiki',
        askYourWiki: 'Ask your Wiki',
        askThisWiki: 'Ask this Wiki',
        signInKeepChatting: 'Sign in to keep chatting',
        internetModeDescription: 'Internet mode uses general web knowledge and current public sources, not just your uploaded material.',
        noSourcesDescription: 'No source documents are attached yet, so answers use internet context and current public sources.',
        publicLimitUsed: 'You have used all 5 anonymous public questions for this atlas. Sign in to continue.',
        anonymousQuestionsAllowed: '5 anonymous questions allowed.',
        anonymousQuestionsLeft: '{count} anonymous questions left.',
        signInGroundedQuestions: 'Sign in to continue asking grounded questions.',
        heroInternetPrompt: 'Ask anything with full internet context and live public sources.',
        heroCitySourcesPrompt: 'Ask {city} anything from your sources.',
        heroWikiSourcesPrompt: 'Ask your living wiki anything from your sources.',
        signInKeepConversation: 'You have used the anonymous question limit for this atlas. Sign in to keep the conversation going.',
        heroInternetSupporting: 'Internet mode is not limited to your documents. It uses public web sources and broader general knowledge.',
        heroCityIndexed: '{city} is indexed into documents and wiki pages so every answer can stay grounded in the material you uploaded.',
        heroIndexed: 'Your documents and wiki pages are indexed so every answer can stay grounded in the material you uploaded.',
        publicAtlasLive: 'Public atlas live',
        myLivingWikiLive: 'Living Wiki live',
        knowledgeReady: 'Knowledge ready',
        anonymousSessionPaused: 'Anonymous session paused',
        internetModeEnabled: 'Internet mode enabled',
        oneIndexedSource: '1 indexed source ready',
        manyIndexedSources: '{count} indexed sources ready',
        internetNoDocumentsHelper: 'Internet mode searches the web because this Wiki does not have source documents yet.',
        internetModeHelper: 'Internet mode searches the web and answers beyond your uploaded sources.',
        wikiModeHelper: 'Living Wiki mode stays grounded in your indexed documents and wiki pages.',
        anonymousQuestionsRemaining: '{count} of 5 anonymous questions remaining.',
        savedWithNameEmail: 'Your questions are saved with your name and email for the atlas owner.',
        latestUpdates: 'Latest updates',
        latestUpdatesPrompt: 'What are the latest updates about {city}?',
        latestUpdatesDetail: 'Search the web for what is current right now.',
        whatMattersNow: 'What matters now',
        whatMattersNowPrompt: 'What should I know right now about {city}?',
        whatMattersNowDetail: 'Get a quick current-events briefing.',
        recentDebates: 'Recent debates',
        recentDebatesPrompt: 'What are people debating about {city} right now?',
        recentDebatesDetail: 'Pull in live internet context and discussion themes.',
        backgroundContext: 'Background context',
        backgroundContextPrompt: 'Give me background context on {city} from public sources.',
        backgroundContextDetail: 'Pull broader context from the open web.',
        quickOverview: 'Quick overview',
        quickOverviewPrompt: 'Give me a quick overview of {city}.',
        quickOverviewDetail: 'Start with the highest-signal summary from the wiki.',
        importantTopics: 'Important topics',
        importantTopicsPrompt: 'What are the most important topics in {city}?',
        importantTopicsDetail: 'See the main themes already covered in this wiki.',
        bestStartingPoint: 'Best starting point',
        bestStartingPointPrompt: 'What should I read first about {city}?',
        bestStartingPointDetail: 'Ask the wiki where a new reader should begin.',
        keyQuestions: 'Key questions',
        keyQuestionsPrompt: 'What are the key open questions about {city}?',
        keyQuestionsDetail: 'Surface the unresolved or most-discussed questions.',
        whatIsTopic: 'What is {topic}?',
        whyTopicMatters: 'Why does {topic} matter?',
        keyFactsTopic: 'Give me the key facts about {topic}.',
        topicConnection: 'How does {topic} connect to {city}?',
        groundedWikiDetail: 'Grounded in the wiki and its sources.',
        knowledgeBaseDetail: 'Use the atlas knowledge base for context.',
        reviewedPlaceCount: '1 reviewed place',
        reviewedPlacesCount: '{count} reviewed places',
        localReviewCount: '1 local review',
        localReviewsCount: '{count} local reviews',
        ratings: '{count} ratings',
        newPlace: 'New',
        you: 'You',
        myLivingWiki: 'Living Wiki',
        guideLabel: 'Your Living Wiki {city} tour guide',
        chat: 'Chat',
        chatTitle: '{city} Chat',
        threads: 'Threads',
        noThreadsYet: 'No threads yet.',
        deleteThread: 'Delete thread {title}',
        showLess: 'Show less',
        showMore: 'Show more ({count})',
        signingOut: 'Signing out...',
        signOut: 'Sign out',
        live: 'Live',
        preview: 'Preview',
        useMyWikiMode: 'Use Living Wiki mode',
        useInternetMode: 'Use internet mode',
        openWikiAdmin: 'Open wiki admin',
        admin: 'Admin',
        chatIsShared: 'Chat is shared',
        shareChat: 'Share chat',
        shared: 'Shared',
        endRealtimeVoiceMode: 'End realtime voice mode',
        startRealtimeVoiceMode: 'Start realtime voice mode',
        endVoiceMode: 'End voice mode',
        voiceMode: 'Voice mode',
        chatCopied: 'Chat copied',
        copyChat: 'Copy chat',
        copied: 'Copied',
        copy: 'Copy',
        closeVoiceMode: 'Close voice mode',
        realtimeVoiceMode: 'Realtime voice mode',
        unmuteMicrophone: 'Unmute microphone',
        muteMicrophone: 'Mute microphone',
        internetModeOnly: 'Internet mode only',
        endVoiceCall: 'End voice call',
        end: 'End',
        liveTranscript: 'Live transcript',
        aiTalking: 'AI is talking',
        listeningForYou: 'Listening for you',
        ai: 'AI',
        spokenWords: 'Spoken words will appear here.',
        voiceTextPlaceholder: 'Send a message to start a chat',
        sendVoiceTextMessage: 'Send voice text message',
        close: 'Close',
        closeSubscribeDialog: 'Close subscribe dialog',
        freeAccess: 'Free Living Wiki access',
        subscribeToWiki: 'Subscribe to {city}',
        joinWiki: 'Join Living Wiki {city}',
        thisWiki: 'this wiki',
        subscribeIntro: 'Get the weekly {city} brief now. Phone access and the rest of the member perks unlock once you join.',
        weeklyUpdatesOn: 'Weekly updates on {city}',
        conciseDigest: 'A concise local digest so {city} does not sneak important things past you.',
        askWikiAnytime: 'Ask the wiki anytime',
        publicChatRealtime: 'Use the public chat for real-time answers about neighborhoods, food, history, routes, and local details.',
        callCityGuide: 'Call the {city} guide',
        callInNumber: 'Your call-in number:',
        joinUnlockPhone: 'Join to unlock the phone number for real-time {city} answers when the line is available.',
        moreAccess: 'More access after joining',
        revealFeatures: 'We will reveal additional member features as they come online for this Living Wiki.',
        subscribing: 'Subscribing...',
        voiceRecap: 'Voice recap',
        emailRecap: 'Email recap',
        summaryTranscript: 'Summary plus transcript excerpt.',
        usefulLinks: 'Useful links',
        includesWiki: 'Includes the wiki and a recap card when ready.',
        signInLower: 'sign in',
        sending: 'Sending...',
        sendRecap: 'Send recap',
        sentTo: 'Sent to {email}',
        emailIncludes: 'The email includes your recap and transcript excerpt.',
        openRecapCard: 'Open recap card',
        continueChat: 'Continue chat',
        shareChatHeader: 'Share chat',
        createPublicShareLink: 'Create a public share link',
        shareDescription: 'Anyone with the link can read this chat. Private account details are not included.',
        shareThreadDescription: 'Anyone with this link can read this thread. They will not be able to reply from the shared page.',
        generateConversationLink: 'Generate a dedicated link for this conversation.',
        readOnlyThreadLink: 'This link will open a read-only public thread page at the exact conversation.',
        creatingLink: 'Creating link...',
        createShareLink: 'Create share link',
        shareLink: 'Share link',
        copyLink: 'Copy link',
        closeShareDialog: 'Close share dialog',
        sharePageReady: 'Share page ready',
        publicUrl: 'Public URL',
        copyUrl: 'Copy URL',
        openPage: 'Open page',
        shareDirectly: 'Share directly',
        recapSent: 'Recap sent',
        sendConversation: 'Send this conversation?',
        voiceRecapOnWay: 'Your {city} voice chat recap is on its way.',
        sendSummaryEmail: 'Send a concise summary, useful links, and the transcript to your email.',
        closeVoiceRecapDialog: 'Close voice recap dialog',
        accountlessSend: 'You can send this without an account. To keep future recaps together,',
        skip: 'Skip',
        done: 'Done',
        connecting: 'Connecting',
        needsAttention: 'Needs attention',
        ready: 'Ready',
        speaking: 'Speaking',
        listening: 'Listening',
        ending: 'Ending',
        endVoice: 'End voice',
        connectingRealtimeVoice: 'Connecting realtime voice',
        aiSpeaking: 'AI speaking',
        endingVoiceMode: 'Ending voice mode',
        voiceModeNeedsSetup: 'Voice mode needs setup',
        realtimeVoiceReady: 'Realtime voice is ready',
        startVoiceConversation: 'Start a voice conversation in your language',
        useLanguageFor: 'Use {language} for {city} ({country})',
        chooseLanguage: 'Choose {language}',
        sourceCitation: 'Source Citation',
        page: 'Page',
        lines: 'Lines',
        deleteThreadTitle: 'Delete thread',
        areYouSure: 'Are you sure?',
        permanentlyRemove: 'This will permanently remove',
        fromSavedThreads: 'from your saved threads.',
        updated: 'Updated',
        cancel: 'Cancel',
        deleting: 'Deleting...',
        ask: 'Ask',
        copiedQuestion: 'Copied question',
        copyQuestion: 'Copy question',
        moreActions: 'More actions',
        more: 'More',
        copyMessage: 'Copy message',
        chatDate: 'Chat date',
        lastUpdated: 'Last updated',
        audioRecap15: '15-sec audio recap',
        hearTakeaway: 'Hear the key takeaway first.',
        stopAudioRecap15: 'Stop 15 second audio recap',
        playAudioRecap15: 'Play 15 second audio recap',
        stopRecap: 'Stop recap',
        preparingEllipsis: 'Preparing...',
        playRecap: 'Play recap',
        listenNow: 'Listen now',
        knowledgeGap: 'This topic is not strongly covered in the current knowledge base yet.',
        fieldGuide: 'Field guide',
        oneStop: '1 stop',
        manyStops: '{count} stops',
        makingCard: 'Making card',
        shareGuide: 'Share guide',
        guidePicks: 'Guide picks',
        yourPlan: 'Your plan',
        cardsAsPlan: 'Use the cards below as the plan. Open full notes for the broader context and caveats.',
        tip: 'Tip',
        map: 'Map',
        article: 'Article',
        saved: 'Saved',
        save: 'Save',
        sharing: 'Sharing...',
        share: 'Share',
        smartRoute: 'Smart route:',
        makingCardEllipsis: 'Making card...',
        shareFullGuideCard: 'Share the full guide card',
        fullNotes: 'Full notes',
        readCompleteTake: 'Read {name}’s complete take',
        fullNotesDescription: 'Context, jokes, caveats, and the full explanation behind the cards.',
        openAnswerCard: 'Open {city} Answer Card',
        openCard: 'Open card',
        makingAnswerCard: 'Making {city} Answer Card',
        makeAnswerCard: 'Make {city} Answer Card',
        makeCard: 'Make card',
        signInMakeAnswerCard: 'Sign in to make {city} Answer Card',
        signInForCard: 'Sign in for card',
        openQuizChallenge: 'Open quiz challenge',
        openQuiz: 'Open quiz',
        makingQuizChallenge: 'Making quiz challenge',
        makeQuizChallenge: 'Make quiz challenge',
        makingQuiz: 'Making quiz',
        makeQuiz: 'Make quiz',
        signInMakeQuiz: 'Sign in to make quiz challenge',
        signInForQuiz: 'Sign in for quiz',
        copiedAnswer: 'Copied answer',
        copyAnswer: 'Copy answer',
        thinkingSearch: 'Searching knowledge base',
        thinkingRead: 'Reading relevant entries',
        thinkingSynthesize: 'Synthesizing answer',
      },
      es: {
        weSpeakYourLanguage: 'Hablamos tu idioma',
        voiceHintManual: '{count} países · elige una bandera primero.',
        voiceHintAuto: '{count} países · seleccionado para {country}.',
        findCountry: 'Buscar país',
        clearCountrySearch: 'Borrar búsqueda de país',
        previousLanguages: 'Idiomas anteriores',
        moreLanguages: 'Más idiomas',
        choose: 'Elegir',
        noMatchingLanguage: 'No hay país o idioma coincidente.',
        chooseLanguagePrompt: 'Elige una bandera para cambiar {city} a tu idioma.',
        selectFlagFirst: 'Elige una bandera primero',
        speakInLanguage: 'Háblame en {language}',
        language: 'Idioma',
        voiceModeSelected: 'Modo de voz seleccionado',
        startVoiceModeIn: 'Iniciar modo de voz en {language}',
        loadingChat: 'Cargando chat',
        preparingConversation: 'Preparando esta conversación del atlas.',
        emailAddress: 'Dirección de correo',
        joining: 'Uniéndote...',
        joinForFree: 'Únete gratis',
        weeklyUpdates: 'Actualizaciones semanales para estar al día.',
        askLivingWiki: 'Pregunta a Wiki Viva',
        guideAlt: 'Guía de Wiki Viva',
        answerMode: 'Modo de respuesta',
        wiki: 'Wiki',
        internet: 'Internet',
        toSend: 'para enviar',
        signInToContinue: 'Inicia sesión para continuar',
        sendMessage: 'Enviar mensaje',
        suggestedQuestions: 'Preguntas sugeridas',
        signInToSaveChat: 'Inicia sesión para guardar el chat',
        subscribeWeeklyUpdates: 'Suscríbete a las actualizaciones semanales',
        reviewedLocations: 'Lugares reseñados',
        trendingNow: 'Tendencias ahora',
        openPlacesBoard: 'Abrir tablero de lugares',
        noLocalReviewsYet: 'Aún no hay reseñas locales',
        openBoardFirstPlace: 'Abre el tablero para agregar el primer lugar.',
        newChat: 'Nuevo chat',
        exploreCities: 'Explorar ciudades',
        publicLivingWikis: 'Wikis vivas públicas',
        seeAll: 'Ver todo',
        signIn: 'Iniciar sesión',
        subscribe: 'Suscribirse',
        messageLivingWiki: 'Mensaje para Wiki Viva...',
        publicLimitReached: 'Límite público de preguntas alcanzado',
        askFiveNoSignIn: 'Haz hasta 5 preguntas sin iniciar sesión',
        signedInVisitorsFree: 'Los visitantes con sesión iniciada pueden chatear libremente con este atlas',
        askPublicAtlas: 'Haz preguntas sobre este atlas público',
        publicLimitNotice: 'Llegaste al límite público de 5 preguntas. Inicia sesión para continuar esta conversación.',
        askFiveNoSignInPeriod: 'Haz hasta 5 preguntas sin iniciar sesión.',
        remainingQuestions: 'Haz hasta 5 preguntas sin iniciar sesión. Quedan {count}.',
        subscribeNotice: 'Suscríbete para recibir actualizaciones semanales de esta Wiki.',
        askAtlasInternet: 'Pregunta sobre noticias, lugares, empleos, eventos y vida cívica...',
        askCityInternet: 'Pregunta sobre noticias de {city}, vecindarios, transporte, comida, empleos, seguridad, eventos y vida cívica...',
        askCitySources: 'Pregunta cualquier cosa sobre {city} desde tus fuentes.',
        askSources: 'Pregunta cualquier cosa desde tus fuentes.',
        internetModeLabel: 'Modo Internet',
        myLivingWikiLabel: 'Wiki Viva',
        askYourWiki: 'Pregunta a tu Wiki',
        askThisWiki: 'Pregunta a esta Wiki',
        signInKeepChatting: 'Inicia sesión para seguir chateando',
        internetModeDescription: 'El modo Internet usa conocimiento general y fuentes públicas actuales, no solo tu material cargado.',
        noSourcesDescription: 'Aún no hay documentos fuente adjuntos, así que las respuestas usan contexto de internet y fuentes públicas actuales.',
        publicLimitUsed: 'Ya usaste las 5 preguntas públicas anónimas para este atlas. Inicia sesión para continuar.',
        anonymousQuestionsAllowed: 'Se permiten 5 preguntas anónimas.',
        anonymousQuestionsLeft: 'Quedan {count} preguntas anónimas.',
        signInGroundedQuestions: 'Inicia sesión para seguir haciendo preguntas con fuentes.',
        heroInternetPrompt: 'Pregunta cualquier cosa con contexto completo de internet y fuentes públicas actualizadas.',
        heroCitySourcesPrompt: 'Pregunta cualquier cosa sobre {city} desde tus fuentes.',
        heroWikiSourcesPrompt: 'Pregunta cualquier cosa a tu wiki viva desde tus fuentes.',
        signInKeepConversation: 'Usaste el límite de preguntas anónimas para este atlas. Inicia sesión para continuar la conversación.',
        heroInternetSupporting: 'El modo Internet no se limita a tus documentos. Usa fuentes web públicas y conocimiento general más amplio.',
        heroCityIndexed: '{city} está indexado en documentos y páginas wiki para que cada respuesta pueda apoyarse en el material que cargaste.',
        heroIndexed: 'Tus documentos y páginas wiki están indexados para que cada respuesta pueda apoyarse en el material que cargaste.',
        publicAtlasLive: 'Atlas público activo',
        myLivingWikiLive: 'Wiki Viva activa',
        knowledgeReady: 'Conocimiento listo',
        anonymousSessionPaused: 'Sesión anónima pausada',
        internetModeEnabled: 'Modo Internet activado',
        oneIndexedSource: '1 fuente indexada lista',
        manyIndexedSources: '{count} fuentes indexadas listas',
        internetNoDocumentsHelper: 'El modo Internet busca en la web porque esta Wiki aún no tiene documentos fuente.',
        internetModeHelper: 'El modo Internet busca en la web y responde más allá de tus fuentes cargadas.',
        wikiModeHelper: 'El modo Wiki Viva se mantiene apoyado en tus documentos indexados y páginas wiki.',
        anonymousQuestionsRemaining: 'Quedan {count} de 5 preguntas anónimas.',
        savedWithNameEmail: 'Tus preguntas se guardan con tu nombre y correo para el propietario del atlas.',
        latestUpdates: 'Últimas novedades',
        latestUpdatesPrompt: '¿Cuáles son las últimas novedades sobre {city}?',
        latestUpdatesDetail: 'Busca en la web lo que está ocurriendo ahora.',
        whatMattersNow: 'Lo importante ahora',
        whatMattersNowPrompt: '¿Qué debo saber ahora mismo sobre {city}?',
        whatMattersNowDetail: 'Obtén un resumen rápido de actualidad.',
        recentDebates: 'Debates recientes',
        recentDebatesPrompt: '¿Qué está debatiendo la gente sobre {city} ahora?',
        recentDebatesDetail: 'Incluye contexto de internet en vivo y temas de discusión.',
        backgroundContext: 'Contexto general',
        backgroundContextPrompt: 'Dame contexto general sobre {city} usando fuentes públicas.',
        backgroundContextDetail: 'Trae contexto más amplio desde la web abierta.',
        quickOverview: 'Resumen rápido',
        quickOverviewPrompt: 'Dame un resumen rápido de {city}.',
        quickOverviewDetail: 'Empieza con el resumen de mayor señal de la wiki.',
        importantTopics: 'Temas importantes',
        importantTopicsPrompt: '¿Cuáles son los temas más importantes en {city}?',
        importantTopicsDetail: 'Muestra los temas principales ya cubiertos en esta wiki.',
        bestStartingPoint: 'Mejor punto de partida',
        bestStartingPointPrompt: '¿Qué debería leer primero sobre {city}?',
        bestStartingPointDetail: 'Pregunta a la wiki por dónde debería empezar un lector nuevo.',
        keyQuestions: 'Preguntas clave',
        keyQuestionsPrompt: '¿Cuáles son las preguntas abiertas clave sobre {city}?',
        keyQuestionsDetail: 'Muestra las preguntas sin resolver o más discutidas.',
        whatIsTopic: '¿Qué es {topic}?',
        whyTopicMatters: '¿Por qué importa {topic}?',
        keyFactsTopic: 'Dame los datos clave sobre {topic}.',
        topicConnection: '¿Cómo se conecta {topic} con {city}?',
        groundedWikiDetail: 'Basado en la wiki y sus fuentes.',
        knowledgeBaseDetail: 'Usa la base de conocimiento del atlas como contexto.',
        reviewedPlaceCount: '1 lugar reseñado',
        reviewedPlacesCount: '{count} lugares reseñados',
        localReviewCount: '1 reseña local',
        localReviewsCount: '{count} reseñas locales',
        ratings: '{count} calificaciones',
        newPlace: 'Nuevo',
        you: 'Tú',
        myLivingWiki: 'Wiki Viva',
        guideLabel: 'Tu guía de Wiki Viva {city}',
        chat: 'Chat',
        chatTitle: 'Chat de {city}',
        threads: 'Conversaciones',
        noThreadsYet: 'Aún no hay conversaciones.',
        deleteThread: 'Eliminar conversación {title}',
        showLess: 'Mostrar menos',
        showMore: 'Mostrar más ({count})',
        signingOut: 'Cerrando sesión...',
        signOut: 'Cerrar sesión',
        live: 'Activo',
        preview: 'Vista previa',
        useMyWikiMode: 'Usar modo Wiki Viva',
        useInternetMode: 'Usar modo Internet',
        openWikiAdmin: 'Abrir administración de la wiki',
        admin: 'Admin',
        chatIsShared: 'El chat está compartido',
        shareChat: 'Compartir chat',
        shared: 'Compartido',
        endRealtimeVoiceMode: 'Terminar modo de voz en tiempo real',
        startRealtimeVoiceMode: 'Iniciar modo de voz en tiempo real',
        endVoiceMode: 'Terminar modo de voz',
        voiceMode: 'Modo de voz',
        chatCopied: 'Chat copiado',
        copyChat: 'Copiar chat',
        copied: 'Copiado',
        copy: 'Copiar',
        closeVoiceMode: 'Cerrar modo de voz',
        realtimeVoiceMode: 'Modo de voz en tiempo real',
        unmuteMicrophone: 'Activar micrófono',
        muteMicrophone: 'Silenciar micrófono',
        internetModeOnly: 'Solo modo Internet',
        endVoiceCall: 'Terminar llamada de voz',
        end: 'Terminar',
        liveTranscript: 'Transcripción en vivo',
        aiTalking: 'La IA está hablando',
        listeningForYou: 'Escuchándote',
        ai: 'IA',
        spokenWords: 'Las palabras habladas aparecerán aquí.',
        voiceTextPlaceholder: 'Envía un mensaje para iniciar un chat',
        sendVoiceTextMessage: 'Enviar mensaje de texto por voz',
        close: 'Cerrar',
        closeSubscribeDialog: 'Cerrar diálogo de suscripción',
        freeAccess: 'Acceso gratis a Wiki Viva',
        subscribeToWiki: 'Suscribirse a {city}',
        joinWiki: 'Unirse a Wiki Viva {city}',
        thisWiki: 'esta wiki',
        subscribeIntro: 'Recibe ahora el resumen semanal de {city}. El acceso por teléfono y el resto de beneficios se activan cuando te unas.',
        weeklyUpdatesOn: 'Actualizaciones semanales sobre {city}',
        conciseDigest: 'Un resumen local conciso para que no se te pase nada importante de {city}.',
        askWikiAnytime: 'Pregunta a la wiki cuando quieras',
        publicChatRealtime: 'Usa el chat público para respuestas en tiempo real sobre vecindarios, comida, historia, rutas y detalles locales.',
        callCityGuide: 'Llama a la guía de {city}',
        callInNumber: 'Tu número para llamar:',
        joinUnlockPhone: 'Únete para desbloquear el número de teléfono y recibir respuestas en tiempo real sobre {city} cuando la línea esté disponible.',
        moreAccess: 'Más acceso después de unirte',
        revealFeatures: 'Mostraremos funciones adicionales para miembros cuando estén disponibles para esta Wiki Viva.',
        subscribing: 'Suscribiendo...',
        voiceRecap: 'Resumen de voz',
        emailRecap: 'Resumen por correo',
        summaryTranscript: 'Resumen más extracto de la transcripción.',
        usefulLinks: 'Enlaces útiles',
        includesWiki: 'Incluye la wiki y una tarjeta de resumen cuando esté lista.',
        signInLower: 'iniciar sesión',
        sending: 'Enviando...',
        sendRecap: 'Enviar resumen',
        sentTo: 'Enviado a {email}',
        emailIncludes: 'El correo incluye tu resumen y un extracto de la transcripción.',
        openRecapCard: 'Abrir tarjeta de resumen',
        continueChat: 'Continuar chat',
        shareChatHeader: 'Compartir chat',
        createPublicShareLink: 'Crear un enlace público para compartir',
        shareDescription: 'Cualquier persona con el enlace puede leer este chat. No se incluyen datos privados de la cuenta.',
        shareThreadDescription: 'Cualquier persona con este enlace puede leer esta conversación. No podrá responder desde la página compartida.',
        generateConversationLink: 'Genera un enlace dedicado para esta conversación.',
        readOnlyThreadLink: 'Este enlace abrirá una página pública de solo lectura en la conversación exacta.',
        creatingLink: 'Creando enlace...',
        createShareLink: 'Crear enlace para compartir',
        shareLink: 'Enlace para compartir',
        copyLink: 'Copiar enlace',
        closeShareDialog: 'Cerrar diálogo de compartir',
        sharePageReady: 'Página para compartir lista',
        publicUrl: 'URL pública',
        copyUrl: 'Copiar URL',
        openPage: 'Abrir página',
        shareDirectly: 'Compartir directamente',
        recapSent: 'Resumen enviado',
        sendConversation: '¿Enviar esta conversación?',
        voiceRecapOnWay: 'Tu resumen de voz de {city} está en camino.',
        sendSummaryEmail: 'Envía a tu correo un resumen conciso, enlaces útiles y la transcripción.',
        closeVoiceRecapDialog: 'Cerrar diálogo de resumen de voz',
        accountlessSend: 'Puedes enviarlo sin una cuenta. Para mantener juntos futuros resúmenes,',
        skip: 'Omitir',
        done: 'Listo',
        connecting: 'Conectando',
        needsAttention: 'Necesita atención',
        ready: 'Listo',
        speaking: 'Hablando',
        listening: 'Escuchando',
        ending: 'Terminando',
        endVoice: 'Terminar voz',
        connectingRealtimeVoice: 'Conectando voz en tiempo real',
        aiSpeaking: 'La IA está hablando',
        endingVoiceMode: 'Terminando modo de voz',
        voiceModeNeedsSetup: 'El modo de voz necesita configuración',
        realtimeVoiceReady: 'La voz en tiempo real está lista',
        startVoiceConversation: 'Inicia una conversación de voz en tu idioma',
        useLanguageFor: 'Usar {language} para {city} ({country})',
        chooseLanguage: 'Elegir {language}',
        sourceCitation: 'Cita de fuente',
        page: 'Página',
        lines: 'Líneas',
        deleteThreadTitle: 'Eliminar conversación',
        areYouSure: '¿Estás seguro?',
        permanentlyRemove: 'Esto eliminará permanentemente',
        fromSavedThreads: 'de tus conversaciones guardadas.',
        updated: 'Actualizado',
        cancel: 'Cancelar',
        deleting: 'Eliminando...',
        ask: 'Preguntar',
        copiedQuestion: 'Pregunta copiada',
        copyQuestion: 'Copiar pregunta',
        moreActions: 'Más acciones',
        more: 'Más',
        copyMessage: 'Copiar mensaje',
        chatDate: 'Fecha del chat',
        lastUpdated: 'Última actualización',
        audioRecap15: 'Resumen de audio de 15 segundos',
        hearTakeaway: 'Escucha primero la idea clave.',
        stopAudioRecap15: 'Detener resumen de audio de 15 segundos',
        playAudioRecap15: 'Reproducir resumen de audio de 15 segundos',
        stopRecap: 'Detener resumen',
        preparingEllipsis: 'Preparando...',
        playRecap: 'Reproducir resumen',
        listenNow: 'Escuchar ahora',
        knowledgeGap: 'Este tema aún no está cubierto con fuerza en la base de conocimiento actual.',
        fieldGuide: 'Guía de campo',
        oneStop: '1 parada',
        manyStops: '{count} paradas',
        makingCard: 'Creando tarjeta',
        shareGuide: 'Compartir guía',
        guidePicks: 'Selecciones de la guía',
        yourPlan: 'Tu plan',
        cardsAsPlan: 'Usa las tarjetas de abajo como plan. Abre las notas completas para ver más contexto y matices.',
        tip: 'Consejo',
        map: 'Mapa',
        article: 'Artículo',
        saved: 'Guardado',
        save: 'Guardar',
        sharing: 'Compartiendo...',
        share: 'Compartir',
        smartRoute: 'Ruta inteligente:',
        makingCardEllipsis: 'Creando tarjeta...',
        shareFullGuideCard: 'Compartir la tarjeta completa de la guía',
        fullNotes: 'Notas completas',
        readCompleteTake: 'Leer la opinión completa de {name}',
        fullNotesDescription: 'Contexto, humor, matices y la explicación completa detrás de las tarjetas.',
        openAnswerCard: 'Abrir tarjeta de respuesta de {city}',
        openCard: 'Abrir tarjeta',
        makingAnswerCard: 'Creando tarjeta de respuesta de {city}',
        makeAnswerCard: 'Crear tarjeta de respuesta de {city}',
        makeCard: 'Crear tarjeta',
        signInMakeAnswerCard: 'Inicia sesión para crear la tarjeta de respuesta de {city}',
        signInForCard: 'Inicia sesión para la tarjeta',
        openQuizChallenge: 'Abrir reto de quiz',
        openQuiz: 'Abrir quiz',
        makingQuizChallenge: 'Creando reto de quiz',
        makeQuizChallenge: 'Crear reto de quiz',
        makingQuiz: 'Creando quiz',
        makeQuiz: 'Crear quiz',
        signInMakeQuiz: 'Inicia sesión para crear el reto de quiz',
        signInForQuiz: 'Inicia sesión para el quiz',
        copiedAnswer: 'Respuesta copiada',
        copyAnswer: 'Copiar respuesta',
        thinkingSearch: 'Buscando en la base de conocimiento',
        thinkingRead: 'Leyendo entradas relevantes',
        thinkingSynthesize: 'Sintetizando respuesta',
      },
      fr: {
        weSpeakYourLanguage: 'Nous parlons votre langue',
        voiceHintManual: '{count} pays · choisissez d’abord un drapeau.',
        voiceHintAuto: '{count} pays · sélectionné pour {country}.',
        findCountry: 'Trouver un pays',
        clearCountrySearch: 'Effacer la recherche de pays',
        previousLanguages: 'Langues précédentes',
        moreLanguages: 'Plus de langues',
        choose: 'Choisir',
        noMatchingLanguage: 'Aucun pays ou langue correspondant.',
        chooseLanguagePrompt: 'Choisissez un drapeau pour passer {city} dans votre langue.',
        selectFlagFirst: 'Choisissez d’abord un drapeau',
        speakInLanguage: 'Parlez-moi en {language}',
        language: 'Langue',
        voiceModeSelected: 'Mode vocal sélectionné',
        startVoiceModeIn: 'Démarrer le mode vocal en {language}',
      },
      de: {
        weSpeakYourLanguage: 'Wir sprechen deine Sprache',
        voiceHintManual: '{count} Länder · wähle zuerst eine Flagge.',
        voiceHintAuto: '{count} Länder · für {country} ausgewählt.',
        findCountry: 'Land suchen',
        clearCountrySearch: 'Ländersuche löschen',
        previousLanguages: 'Vorherige Sprachen',
        moreLanguages: 'Weitere Sprachen',
        choose: 'Auswählen',
        noMatchingLanguage: 'Kein passendes Land oder keine passende Sprache.',
        chooseLanguagePrompt: 'Wähle eine Flagge, um {city} in deine Sprache umzuschalten.',
        selectFlagFirst: 'Wähle zuerst eine Flagge',
        speakInLanguage: 'Sprich mit mir auf {language}',
        language: 'Sprache',
        voiceModeSelected: 'Sprachmodus ausgewählt',
        startVoiceModeIn: 'Sprachmodus auf {language} starten',
      },
      pt: {
        weSpeakYourLanguage: 'Falamos o seu idioma',
        voiceHintManual: '{count} países · escolha uma bandeira primeiro.',
        voiceHintAuto: '{count} países · selecionado para {country}.',
        findCountry: 'Encontrar país',
        clearCountrySearch: 'Limpar busca de país',
        previousLanguages: 'Idiomas anteriores',
        moreLanguages: 'Mais idiomas',
        choose: 'Escolher',
        noMatchingLanguage: 'Nenhum país ou idioma correspondente.',
        chooseLanguagePrompt: 'Escolha uma bandeira para mudar {city} para o seu idioma.',
        selectFlagFirst: 'Escolha uma bandeira primeiro',
        speakInLanguage: 'Fale comigo em {language}',
        language: 'Idioma',
        voiceModeSelected: 'Modo de voz selecionado',
        startVoiceModeIn: 'Iniciar modo de voz em {language}',
      },
      ar: {
        weSpeakYourLanguage: 'نتحدث لغتك',
        voiceHintManual: '{count} دولة · اختر علماً أولاً.',
        voiceHintAuto: '{count} دولة · تم الاختيار لـ {country}.',
        findCountry: 'ابحث عن بلد',
        clearCountrySearch: 'مسح بحث البلد',
        previousLanguages: 'اللغات السابقة',
        moreLanguages: 'المزيد من اللغات',
        choose: 'اختر',
        noMatchingLanguage: 'لا يوجد بلد أو لغة مطابقة.',
        chooseLanguagePrompt: 'اختر علماً لتحويل {city} إلى لغتك.',
        selectFlagFirst: 'اختر علماً أولاً',
        speakInLanguage: 'تحدث معي باللغة {language}',
        language: 'اللغة',
        voiceModeSelected: 'تم اختيار وضع الصوت',
        startVoiceModeIn: 'بدء وضع الصوت باللغة {language}',
      },
      zh: {
        weSpeakYourLanguage: '我们会说你的语言',
        voiceHintManual: '{count} 个国家 · 请先选择旗帜。',
        voiceHintAuto: '{count} 个国家 · 已为 {country} 选择。',
        findCountry: '查找国家',
        clearCountrySearch: '清除国家搜索',
        previousLanguages: '上一组语言',
        moreLanguages: '更多语言',
        choose: '选择',
        noMatchingLanguage: '没有匹配的国家或语言。',
        chooseLanguagePrompt: '选择一面旗帜，将 {city} 切换为你的语言。',
        selectFlagFirst: '请先选择旗帜',
        speakInLanguage: '用 {language} 和我说话',
        language: '语言',
        voiceModeSelected: '已选择语音模式',
        startVoiceModeIn: '用 {language} 开始语音模式',
      },
    };

    const template = dictionaries[family]?.[key] ?? this.coreUiText(family, key) ?? dictionaries['en']?.[key] ?? key;
    return Object.entries(params).reduce(
      (text, [paramKey, value]) => text.replaceAll(`{${paramKey}}`, value),
      template,
    );
  }

  private coreUiText(family: string, key: ChatUiTextKey): string | undefined {
    const aliases: Record<string, string> = {
      bs: 'hr',
      'pt-br': 'pt',
    };
    const normalized = aliases[family] ?? family;
    const packs: Record<string, Partial<Record<ChatUiTextKey, string>>> = {
      fr: {
        loadingChat: 'Chargement du chat',
        preparingConversation: 'Préparation de cette conversation d’atlas.',
        emailAddress: 'Adresse e-mail',
        joining: 'Inscription...',
        joinForFree: 'Rejoindre gratuitement',
        weeklyUpdates: 'Des mises à jour hebdomadaires pour rester informé.',
        askLivingWiki: 'Demander à Wiki Vivant',
        guideAlt: 'Guide de Wiki Vivant',
        answerMode: 'Mode de réponse',
        wiki: 'Wiki',
        internet: 'Internet',
        toSend: 'pour envoyer',
        signInToContinue: 'Connectez-vous pour continuer',
        sendMessage: 'Envoyer le message',
        suggestedQuestions: 'Questions suggérées',
        signInToSaveChat: 'Connectez-vous pour enregistrer le chat',
        subscribeWeeklyUpdates: 'S’abonner aux mises à jour hebdomadaires',
        reviewedLocations: 'Lieux évalués',
        trendingNow: 'Tendances actuelles',
        openPlacesBoard: 'Ouvrir le tableau des lieux',
        noLocalReviewsYet: 'Aucun avis local pour le moment',
        openBoardFirstPlace: 'Ouvrez le tableau pour ajouter le premier lieu.',
        newChat: 'Nouveau chat',
        exploreCities: 'Explorer les villes',
        publicLivingWikis: 'Wikis vivants publics',
        seeAll: 'Tout voir',
        signIn: 'Se connecter',
        subscribe: 'S’abonner',
        messageLivingWiki: 'Message pour Wiki Vivant...',
        publicLimitReached: 'Limite de questions publiques atteinte',
        askFiveNoSignIn: 'Posez jusqu’à 5 questions sans vous connecter',
        remainingQuestions: 'Posez jusqu’à 5 questions sans vous connecter. {count} restantes.',
        askCityInternet: 'Posez des questions sur l’actualité de {city}, les quartiers, les transports, la nourriture, les emplois, la sécurité, les événements et la vie civique...',
        internetModeLabel: 'Mode Internet',
        myLivingWikiLabel: 'Wiki Vivant',
        heroInternetPrompt: 'Posez n’importe quelle question avec le contexte complet d’Internet et des sources publiques à jour.',
        internetModeHelper: 'Le mode Internet recherche sur le web et répond au-delà de vos sources importées.',
        latestUpdates: 'Dernières nouvelles',
        latestUpdatesPrompt: 'Quelles sont les dernières nouvelles sur {city} ?',
        whatMattersNow: 'Ce qui compte maintenant',
        whatMattersNowPrompt: 'Que dois-je savoir maintenant sur {city} ?',
        recentDebates: 'Débats récents',
        recentDebatesPrompt: 'De quoi les gens débattent-ils à propos de {city} en ce moment ?',
        backgroundContext: 'Contexte général',
        backgroundContextPrompt: 'Donnez-moi le contexte général sur {city} à partir de sources publiques.',
        reviewedPlaceCount: '1 lieu évalué',
        reviewedPlacesCount: '{count} lieux évalués',
        localReviewCount: '1 avis local',
        localReviewsCount: '{count} avis locaux',
        guideLabel: 'Votre guide de Wiki Vivant {city}',
        chatTitle: 'Chat de {city}',
        live: 'En direct',
        preview: 'Aperçu',
      },
      de: {
        loadingChat: 'Chat wird geladen',
        preparingConversation: 'Diese Atlas-Unterhaltung wird vorbereitet.',
        emailAddress: 'E-Mail-Adresse',
        joining: 'Beitreten...',
        joinForFree: 'Kostenlos beitreten',
        weeklyUpdates: 'Wöchentliche Updates, damit du informiert bleibst.',
        askLivingWiki: 'Frag Lebendiges Wiki',
        guideAlt: 'Guide von Lebendiges Wiki',
        answerMode: 'Antwortmodus',
        wiki: 'Wiki',
        internet: 'Internet',
        toSend: 'zum Senden',
        signInToContinue: 'Einloggen, um fortzufahren',
        sendMessage: 'Nachricht senden',
        suggestedQuestions: 'Vorgeschlagene Fragen',
        signInToSaveChat: 'Einloggen, um den Chat zu speichern',
        subscribeWeeklyUpdates: 'Wöchentliche Updates abonnieren',
        reviewedLocations: 'Bewertete Orte',
        trendingNow: 'Gerade im Trend',
        openPlacesBoard: 'Orte-Board öffnen',
        noLocalReviewsYet: 'Noch keine lokalen Bewertungen',
        openBoardFirstPlace: 'Öffne das Board, um den ersten Ort hinzuzufügen.',
        newChat: 'Neuer Chat',
        exploreCities: 'Städte erkunden',
        publicLivingWikis: 'Öffentliche lebendige Wikis',
        seeAll: 'Alle anzeigen',
        signIn: 'Einloggen',
        subscribe: 'Abonnieren',
        messageLivingWiki: 'Nachricht an Lebendiges Wiki...',
        publicLimitReached: 'Öffentliches Fragenlimit erreicht',
        askFiveNoSignIn: 'Bis zu 5 Fragen ohne Anmeldung stellen',
        remainingQuestions: 'Bis zu 5 Fragen ohne Anmeldung stellen. {count} übrig.',
        askCityInternet: 'Frag nach Nachrichten zu {city}, Vierteln, Verkehr, Essen, Jobs, Sicherheit, Veranstaltungen und Stadtleben...',
        internetModeLabel: 'Internetmodus',
        myLivingWikiLabel: 'Lebendiges Wiki',
        heroInternetPrompt: 'Frag alles mit vollständigem Internetkontext und aktuellen öffentlichen Quellen.',
        internetModeHelper: 'Der Internetmodus durchsucht das Web und antwortet über deine hochgeladenen Quellen hinaus.',
        latestUpdates: 'Neueste Updates',
        latestUpdatesPrompt: 'Was gibt es Neues über {city}?',
        whatMattersNow: 'Was jetzt wichtig ist',
        whatMattersNowPrompt: 'Was sollte ich jetzt über {city} wissen?',
        recentDebates: 'Aktuelle Debatten',
        recentDebatesPrompt: 'Worüber diskutieren Menschen gerade bei {city}?',
        backgroundContext: 'Hintergrundkontext',
        backgroundContextPrompt: 'Gib mir Hintergrundkontext zu {city} aus öffentlichen Quellen.',
        reviewedPlaceCount: '1 bewerteter Ort',
        reviewedPlacesCount: '{count} bewertete Orte',
        localReviewCount: '1 lokale Bewertung',
        localReviewsCount: '{count} lokale Bewertungen',
        guideLabel: 'Dein Guide von Lebendiges Wiki {city}',
        chatTitle: '{city}-Chat',
        live: 'Live',
        preview: 'Vorschau',
      },
      pt: {
        loadingChat: 'Carregando chat',
        preparingConversation: 'Preparando esta conversa do atlas.',
        emailAddress: 'Endereço de e-mail',
        joining: 'Entrando...',
        joinForFree: 'Entrar grátis',
        weeklyUpdates: 'Atualizações semanais para ficar por dentro.',
        askLivingWiki: 'Pergunte ao Wiki Vivo',
        guideAlt: 'Guia do Wiki Vivo',
        answerMode: 'Modo de resposta',
        wiki: 'Wiki',
        internet: 'Internet',
        toSend: 'para enviar',
        signInToContinue: 'Entre para continuar',
        sendMessage: 'Enviar mensagem',
        suggestedQuestions: 'Perguntas sugeridas',
        signInToSaveChat: 'Entre para salvar o chat',
        subscribeWeeklyUpdates: 'Assinar atualizações semanais',
        reviewedLocations: 'Locais avaliados',
        trendingNow: 'Em alta agora',
        openPlacesBoard: 'Abrir painel de locais',
        noLocalReviewsYet: 'Ainda não há avaliações locais',
        openBoardFirstPlace: 'Abra o painel para adicionar o primeiro lugar.',
        newChat: 'Novo chat',
        exploreCities: 'Explorar cidades',
        publicLivingWikis: 'Wikis vivos públicos',
        seeAll: 'Ver tudo',
        signIn: 'Entrar',
        subscribe: 'Assinar',
        messageLivingWiki: 'Mensagem para Wiki Vivo...',
        publicLimitReached: 'Limite público de perguntas atingido',
        askFiveNoSignIn: 'Faça até 5 perguntas sem entrar',
        remainingQuestions: 'Faça até 5 perguntas sem entrar. Restam {count}.',
        askCityInternet: 'Pergunte sobre notícias de {city}, bairros, transporte, comida, empregos, segurança, eventos e vida cívica...',
        internetModeLabel: 'Modo Internet',
        myLivingWikiLabel: 'Wiki Vivo',
        heroInternetPrompt: 'Pergunte qualquer coisa com contexto completo da internet e fontes públicas atualizadas.',
        internetModeHelper: 'O modo Internet pesquisa na web e responde além das suas fontes enviadas.',
        latestUpdates: 'Últimas atualizações',
        latestUpdatesPrompt: 'Quais são as últimas atualizações sobre {city}?',
        whatMattersNow: 'O que importa agora',
        whatMattersNowPrompt: 'O que devo saber agora sobre {city}?',
        recentDebates: 'Debates recentes',
        recentDebatesPrompt: 'Sobre o que as pessoas estão debatendo em {city} agora?',
        backgroundContext: 'Contexto geral',
        backgroundContextPrompt: 'Dê-me contexto geral sobre {city} a partir de fontes públicas.',
        reviewedPlaceCount: '1 local avaliado',
        reviewedPlacesCount: '{count} locais avaliados',
        localReviewCount: '1 avaliação local',
        localReviewsCount: '{count} avaliações locais',
        guideLabel: 'Seu guia do Wiki Vivo {city}',
        chatTitle: 'Chat de {city}',
        live: 'Ao vivo',
        preview: 'Prévia',
      },
      nl: {
        weSpeakYourLanguage: 'We spreken je taal',
        voiceHintManual: '{count} landen · kies eerst een vlag.',
        voiceHintAuto: '{count} landen · geselecteerd voor {country}.',
        findCountry: 'Land zoeken',
        choose: 'Kiezen',
        askLivingWiki: 'Vraag Levende Wiki',
        guideAlt: 'Gids van Levende Wiki',
        joinForFree: 'Gratis meedoen',
        weeklyUpdates: 'Wekelijkse updates om op de hoogte te blijven.',
        newChat: 'Nieuwe chat',
        exploreCities: 'Steden verkennen',
        publicLivingWikis: 'Openbare levende wiki’s',
        seeAll: 'Alles bekijken',
        signIn: 'Inloggen',
        askFiveNoSignIn: 'Stel tot 5 vragen zonder in te loggen',
        remainingQuestions: 'Stel tot 5 vragen zonder in te loggen. Nog {count}.',
        suggestedQuestions: 'Voorgestelde vragen',
        reviewedLocations: 'Beoordeelde locaties',
        trendingNow: 'Nu populair',
        askCityInternet: 'Vraag naar nieuws over {city}, buurten, vervoer, eten, banen, veiligheid, evenementen en burgerleven...',
        heroInternetPrompt: 'Vraag alles met volledige internetcontext en actuele openbare bronnen.',
        latestUpdates: 'Laatste updates',
        latestUpdatesPrompt: 'Wat zijn de laatste updates over {city}?',
        whatMattersNow: 'Wat nu belangrijk is',
        whatMattersNowPrompt: 'Wat moet ik nu weten over {city}?',
        recentDebates: 'Recente debatten',
        recentDebatesPrompt: 'Waarover debatteren mensen nu rond {city}?',
        backgroundContext: 'Achtergrondcontext',
        backgroundContextPrompt: 'Geef me achtergrondcontext over {city} uit openbare bronnen.',
        reviewedPlacesCount: '{count} beoordeelde plaatsen',
        localReviewCount: '1 lokale review',
        localReviewsCount: '{count} lokale reviews',
        guideLabel: 'Je gids van Levende Wiki {city}',
        chatTitle: '{city}-chat',
        live: 'Live',
      },
      ar: {
        loadingChat: 'جارٍ تحميل الدردشة',
        preparingConversation: 'جارٍ تجهيز محادثة هذا الأطلس.',
        emailAddress: 'البريد الإلكتروني',
        joining: 'جارٍ الانضمام...',
        joinForFree: 'انضم مجاناً',
        weeklyUpdates: 'تحديثات أسبوعية لتبقى على اطلاع.',
        askLivingWiki: 'اسأل ويكي الحي',
        guideAlt: 'دليل ويكي الحي',
        answerMode: 'وضع الإجابة',
        wiki: 'ويكي',
        internet: 'الإنترنت',
        toSend: 'للإرسال',
        signInToContinue: 'سجّل الدخول للمتابعة',
        sendMessage: 'إرسال الرسالة',
        suggestedQuestions: 'أسئلة مقترحة',
        signInToSaveChat: 'سجّل الدخول لحفظ الدردشة',
        reviewedLocations: 'أماكن تمت مراجعتها',
        trendingNow: 'الرائج الآن',
        newChat: 'دردشة جديدة',
        exploreCities: 'استكشاف المدن',
        publicLivingWikis: 'ويكيات حية عامة',
        seeAll: 'عرض الكل',
        signIn: 'تسجيل الدخول',
        askFiveNoSignIn: 'اطرح حتى 5 أسئلة دون تسجيل الدخول',
        remainingQuestions: 'اطرح حتى 5 أسئلة دون تسجيل الدخول. المتبقي {count}.',
        askCityInternet: 'اسأل عن أخبار {city} والأحياء والمواصلات والطعام والوظائف والسلامة والفعاليات والحياة المدنية...',
        internetModeLabel: 'وضع الإنترنت',
        myLivingWikiLabel: 'ويكي الحي',
        heroInternetPrompt: 'اسأل أي شيء مع سياق كامل من الإنترنت ومصادر عامة حديثة.',
        internetModeHelper: 'يبحث وضع الإنترنت في الويب ويجيب خارج نطاق مصادرك المرفوعة.',
        latestUpdates: 'آخر التحديثات',
        latestUpdatesPrompt: 'ما آخر التحديثات حول {city}؟',
        whatMattersNow: 'ما المهم الآن',
        whatMattersNowPrompt: 'ما الذي يجب أن أعرفه الآن عن {city}؟',
        recentDebates: 'نقاشات حديثة',
        recentDebatesPrompt: 'ما الذي يناقشه الناس حول {city} الآن؟',
        backgroundContext: 'سياق عام',
        backgroundContextPrompt: 'أعطني سياقاً عاماً عن {city} من مصادر عامة.',
        reviewedPlacesCount: '{count} أماكن تمت مراجعتها',
        localReviewCount: 'مراجعة محلية واحدة',
        localReviewsCount: '{count} مراجعات محلية',
        guideLabel: 'دليلك في ويكي الحي {city}',
        chatTitle: 'دردشة {city}',
        live: 'مباشر',
      },
      zh: {
        loadingChat: '正在加载聊天',
        preparingConversation: '正在准备此城市图谱对话。',
        emailAddress: '电子邮件地址',
        joining: '正在加入...',
        joinForFree: '免费加入',
        weeklyUpdates: '每周更新，随时掌握动态。',
        askLivingWiki: '询问生活维基',
        guideAlt: '生活维基向导',
        answerMode: '回答模式',
        wiki: '维基',
        internet: '互联网',
        toSend: '发送',
        signInToContinue: '登录以继续',
        sendMessage: '发送消息',
        suggestedQuestions: '推荐问题',
        signInToSaveChat: '登录以保存聊天',
        reviewedLocations: '已评价地点',
        trendingNow: '当前热门',
        newChat: '新聊天',
        exploreCities: '探索城市',
        publicLivingWikis: '公共生活维基',
        seeAll: '查看全部',
        signIn: '登录',
        askFiveNoSignIn: '无需登录即可提问最多 5 个问题',
        remainingQuestions: '无需登录即可提问最多 5 个问题。还剩 {count} 个。',
        askCityInternet: '询问 {city} 的新闻、社区、交通、美食、工作、安全、活动和市政生活...',
        internetModeLabel: '互联网模式',
        myLivingWikiLabel: '生活维基',
        heroInternetPrompt: '结合完整互联网背景和最新公共来源提问任何内容。',
        internetModeHelper: '互联网模式会搜索网络，并回答超出已上传来源的问题。',
        latestUpdates: '最新动态',
        latestUpdatesPrompt: '{city} 有哪些最新动态？',
        whatMattersNow: '现在重要的事',
        whatMattersNowPrompt: '我现在需要了解 {city} 的什么？',
        recentDebates: '近期讨论',
        recentDebatesPrompt: '人们现在在讨论 {city} 的什么？',
        backgroundContext: '背景信息',
        backgroundContextPrompt: '用公共来源给我介绍 {city} 的背景。',
        reviewedPlacesCount: '{count} 个已评价地点',
        localReviewCount: '1 条本地评价',
        localReviewsCount: '{count} 条本地评价',
        guideLabel: '生活维基 {city} 向导',
        chatTitle: '{city} 聊天',
        live: '实时',
      },
      ja: {
        weSpeakYourLanguage: 'あなたの言語で話せます',
        voiceHintManual: '{count}か国 · まず旗を選んでください。',
        voiceHintAuto: '{count}か国 · {country} に合わせて選択済み。',
        findCountry: '国を検索',
        choose: '選択',
        askLivingWiki: 'リビング・ウィキに質問',
        guideAlt: 'リビング・ウィキのガイド',
        joinForFree: '無料で参加',
        newChat: '新しいチャット',
        exploreCities: '都市を探す',
        publicLivingWikis: '公開リビングウィキ',
        seeAll: 'すべて見る',
        signIn: 'サインイン',
        askFiveNoSignIn: 'サインインせずに最大5件まで質問できます',
        remainingQuestions: 'サインインせずに最大5件まで質問できます。残り {count} 件。',
        suggestedQuestions: 'おすすめの質問',
        reviewedLocations: 'レビュー済みの場所',
        trendingNow: '現在のトレンド',
        askCityInternet: '{city} のニュース、地区、交通、食べ物、仕事、安全、イベント、市民生活について質問...',
        heroInternetPrompt: 'インターネット全体の文脈と最新の公開情報を使って何でも質問できます。',
        latestUpdates: '最新情報',
        latestUpdatesPrompt: '{city} の最新情報は？',
        whatMattersNow: '今重要なこと',
        whatMattersNowPrompt: '今 {city} について何を知るべき？',
        recentDebates: '最近の議論',
        recentDebatesPrompt: '今、人々は {city} について何を議論していますか？',
        backgroundContext: '背景情報',
        backgroundContextPrompt: '公開情報から {city} の背景を教えて。',
        reviewedPlacesCount: '{count}件のレビュー済みスポット',
        localReviewCount: '1件のローカルレビュー',
        localReviewsCount: '{count}件のローカルレビュー',
        guideLabel: 'リビング・ウィキ {city} のガイド',
        chatTitle: '{city} チャット',
        live: '公開中',
      },
      ko: {
        weSpeakYourLanguage: '당신의 언어로 말합니다',
        voiceHintManual: '{count}개국 · 먼저 깃발을 선택하세요.',
        voiceHintAuto: '{count}개국 · {country}에 맞게 선택됨.',
        findCountry: '국가 검색',
        choose: '선택',
        askLivingWiki: '살아있는 위키에 질문하기',
        guideAlt: '살아있는 위키 가이드',
        joinForFree: '무료로 참여',
        newChat: '새 채팅',
        exploreCities: '도시 탐색',
        publicLivingWikis: '공개 살아있는 위키',
        seeAll: '모두 보기',
        signIn: '로그인',
        askFiveNoSignIn: '로그인 없이 최대 5개 질문 가능',
        remainingQuestions: '로그인 없이 최대 5개 질문 가능. {count}개 남음.',
        suggestedQuestions: '추천 질문',
        reviewedLocations: '리뷰된 장소',
        trendingNow: '지금 인기',
        askCityInternet: '{city}의 뉴스, 동네, 교통, 음식, 일자리, 안전, 행사, 시민 생활에 대해 물어보세요...',
        heroInternetPrompt: '전체 인터넷 맥락과 최신 공개 출처로 무엇이든 물어보세요.',
        latestUpdates: '최신 업데이트',
        latestUpdatesPrompt: '{city}의 최신 소식은 무엇인가요?',
        whatMattersNow: '지금 중요한 것',
        whatMattersNowPrompt: '지금 {city}에 대해 무엇을 알아야 하나요?',
        recentDebates: '최근 논쟁',
        recentDebatesPrompt: '사람들은 지금 {city}에 대해 무엇을 논의하나요?',
        backgroundContext: '배경 맥락',
        backgroundContextPrompt: '공개 출처로 {city}의 배경을 알려주세요.',
        reviewedPlacesCount: '리뷰된 장소 {count}개',
        localReviewCount: '로컬 리뷰 1개',
        localReviewsCount: '로컬 리뷰 {count}개',
        guideLabel: '살아있는 위키 {city} 가이드',
        chatTitle: '{city} 채팅',
        live: '라이브',
      },
      ru: {
        weSpeakYourLanguage: 'Мы говорим на вашем языке',
        voiceHintManual: '{count} стран · сначала выберите флаг.',
        voiceHintAuto: '{count} стран · выбрано для {country}.',
        findCountry: 'Найти страну',
        choose: 'Выбрать',
        askLivingWiki: 'Спросить Мою живую вики',
        guideAlt: 'Гид Моей живой вики',
        joinForFree: 'Присоединиться бесплатно',
        newChat: 'Новый чат',
        exploreCities: 'Исследовать города',
        publicLivingWikis: 'Публичные живые вики',
        seeAll: 'Смотреть все',
        signIn: 'Войти',
        askFiveNoSignIn: 'Задайте до 5 вопросов без входа',
        remainingQuestions: 'Задайте до 5 вопросов без входа. Осталось {count}.',
        suggestedQuestions: 'Предлагаемые вопросы',
        reviewedLocations: 'Места с отзывами',
        trendingNow: 'Сейчас в тренде',
        askCityInternet: 'Спрашивайте о новостях {city}, районах, транспорте, еде, работе, безопасности, событиях и городской жизни...',
        heroInternetPrompt: 'Задавайте любые вопросы с полным интернет-контекстом и актуальными публичными источниками.',
        latestUpdates: 'Последние обновления',
        latestUpdatesPrompt: 'Какие последние новости о {city}?',
        whatMattersNow: 'Что важно сейчас',
        whatMattersNowPrompt: 'Что мне сейчас нужно знать о {city}?',
        recentDebates: 'Недавние обсуждения',
        recentDebatesPrompt: 'Что сейчас обсуждают люди о {city}?',
        backgroundContext: 'Общий контекст',
        backgroundContextPrompt: 'Дайте общий контекст о {city} из публичных источников.',
        reviewedPlacesCount: '{count} мест с отзывами',
        localReviewCount: '1 местный отзыв',
        localReviewsCount: '{count} местных отзывов',
        guideLabel: 'Ваш гид Моей живой вики {city}',
        chatTitle: 'Чат {city}',
        live: 'Активно',
      },
      hi: {
        weSpeakYourLanguage: 'हम आपकी भाषा बोलते हैं',
        voiceHintManual: '{count} देश · पहले एक झंडा चुनें।',
        findCountry: 'देश खोजें',
        choose: 'चुनें',
        askLivingWiki: 'जीवित विकी से पूछें',
        joinForFree: 'मुफ़्त जुड़ें',
        newChat: 'नई चैट',
        exploreCities: 'शहर देखें',
        publicLivingWikis: 'सार्वजनिक जीवित विकी',
        seeAll: 'सब देखें',
        signIn: 'साइन इन',
        askFiveNoSignIn: 'साइन इन किए बिना 5 प्रश्न तक पूछें',
        remainingQuestions: 'साइन इन किए बिना 5 प्रश्न तक पूछें। {count} बचे हैं।',
        suggestedQuestions: 'सुझाए गए प्रश्न',
        reviewedLocations: 'समीक्षित स्थान',
        trendingNow: 'अभी लोकप्रिय',
        askCityInternet: '{city} की खबरों, मोहल्लों, यातायात, भोजन, नौकरियों, सुरक्षा, कार्यक्रमों और नागरिक जीवन के बारे में पूछें...',
        heroInternetPrompt: 'पूरे इंटरनेट संदर्भ और ताज़ा सार्वजनिक स्रोतों के साथ कुछ भी पूछें।',
        latestUpdates: 'ताज़ा अपडेट',
        latestUpdatesPrompt: '{city} के बारे में ताज़ा अपडेट क्या हैं?',
        whatMattersNow: 'अभी क्या ज़रूरी है',
        whatMattersNowPrompt: 'मुझे अभी {city} के बारे में क्या जानना चाहिए?',
        recentDebates: 'हाल की बहसें',
        backgroundContext: 'पृष्ठभूमि संदर्भ',
        reviewedPlacesCount: '{count} समीक्षित स्थान',
        guideLabel: 'आपका जीवित विकी {city} गाइड',
        chatTitle: '{city} चैट',
        live: 'लाइव',
      },
      cs: {
        weSpeakYourLanguage: 'Mluvíme vaším jazykem',
        voiceHintManual: '{count} zemí · nejprve vyberte vlajku.',
        findCountry: 'Hledat zemi',
        choose: 'Vybrat',
        askLivingWiki: 'Zeptejte se Mé živé wiki',
        joinForFree: 'Připojit se zdarma',
        newChat: 'Nový chat',
        exploreCities: 'Prozkoumat města',
        publicLivingWikis: 'Veřejné živé wiki',
        seeAll: 'Zobrazit vše',
        signIn: 'Přihlásit se',
        askFiveNoSignIn: 'Položte až 5 otázek bez přihlášení',
        remainingQuestions: 'Položte až 5 otázek bez přihlášení. Zbývá {count}.',
        suggestedQuestions: 'Navrhované otázky',
        reviewedLocations: 'Hodnocená místa',
        trendingNow: 'Právě populární',
        askCityInternet: 'Ptejte se na zprávy o {city}, čtvrti, dopravu, jídlo, práci, bezpečnost, akce a občanský život...',
        heroInternetPrompt: 'Ptejte se na cokoli s plným internetovým kontextem a aktuálními veřejnými zdroji.',
        latestUpdates: 'Nejnovější aktuality',
        latestUpdatesPrompt: 'Jaké jsou nejnovější aktuality o {city}?',
        whatMattersNow: 'Co je teď důležité',
        recentDebates: 'Nedávné debaty',
        backgroundContext: 'Obecný kontext',
        reviewedPlacesCount: '{count} hodnocených míst',
        guideLabel: 'Váš průvodce Mé živé wiki {city}',
        chatTitle: 'Chat {city}',
        live: 'Živě',
      },
      hr: {
        weSpeakYourLanguage: 'Govorimo vaš jezik',
        voiceHintManual: '{count} zemalja · prvo odaberite zastavu.',
        findCountry: 'Pretraži zemlju',
        choose: 'Odaberi',
        askLivingWiki: 'Pitaj Živi wiki',
        joinForFree: 'Pridruži se besplatno',
        newChat: 'Novi chat',
        exploreCities: 'Istraži gradove',
        publicLivingWikis: 'Javni živi wikiji',
        seeAll: 'Vidi sve',
        signIn: 'Prijava',
        askFiveNoSignIn: 'Postavite do 5 pitanja bez prijave',
        remainingQuestions: 'Postavite do 5 pitanja bez prijave. Preostalo {count}.',
        suggestedQuestions: 'Predložena pitanja',
        reviewedLocations: 'Recenzirana mjesta',
        trendingNow: 'Trenutno popularno',
        askCityInternet: 'Pitajte o vijestima iz {city}, četvrtima, prijevozu, hrani, poslovima, sigurnosti, događajima i građanskom životu...',
        heroInternetPrompt: 'Pitajte bilo što uz puni internetski kontekst i aktualne javne izvore.',
        latestUpdates: 'Najnovije novosti',
        latestUpdatesPrompt: 'Koje su najnovije novosti o {city}?',
        whatMattersNow: 'Što je sada važno',
        recentDebates: 'Nedavne rasprave',
        backgroundContext: 'Širi kontekst',
        reviewedPlacesCount: '{count} recenzirana mjesta',
        guideLabel: 'Vaš vodič Živi wiki {city}',
        chatTitle: '{city} chat',
        live: 'Uživo',
      },
      fa: {
        weSpeakYourLanguage: 'ما به زبان شما صحبت می‌کنیم',
        voiceHintManual: '{count} کشور · ابتدا یک پرچم انتخاب کنید.',
        findCountry: 'جستجوی کشور',
        choose: 'انتخاب',
        askLivingWiki: 'از ویکی زنده بپرس',
        joinForFree: 'رایگان بپیوندید',
        newChat: 'گفتگوی جدید',
        exploreCities: 'کاوش شهرها',
        publicLivingWikis: 'ویکی‌های زنده عمومی',
        seeAll: 'مشاهده همه',
        signIn: 'ورود',
        askFiveNoSignIn: 'بدون ورود تا ۵ پرسش بپرسید',
        remainingQuestions: 'بدون ورود تا ۵ پرسش بپرسید. {count} باقی مانده.',
        suggestedQuestions: 'پرسش‌های پیشنهادی',
        reviewedLocations: 'مکان‌های بررسی‌شده',
        trendingNow: 'پرطرفدار اکنون',
        askCityInternet: 'درباره اخبار {city}، محله‌ها، حمل‌ونقل، غذا، شغل، امنیت، رویدادها و زندگی شهری بپرسید...',
        heroInternetPrompt: 'با زمینه کامل اینترنت و منابع عمومی به‌روز هر چیزی بپرسید.',
        latestUpdates: 'آخرین به‌روزرسانی‌ها',
        latestUpdatesPrompt: 'آخرین به‌روزرسانی‌ها درباره {city} چیست؟',
        whatMattersNow: 'اکنون چه چیزی مهم است',
        recentDebates: 'بحث‌های اخیر',
        backgroundContext: 'زمینه کلی',
        reviewedPlacesCount: '{count} مکان بررسی‌شده',
        guideLabel: 'راهنمای ویکی زنده {city}',
        chatTitle: 'گفتگوی {city}',
        live: 'زنده',
      },
      no: {
        weSpeakYourLanguage: 'Vi snakker språket ditt',
        voiceHintManual: '{count} land · velg et flagg først.',
        findCountry: 'Finn land',
        choose: 'Velg',
        askLivingWiki: 'Spør Levende wiki',
        joinForFree: 'Bli med gratis',
        newChat: 'Ny chat',
        exploreCities: 'Utforsk byer',
        publicLivingWikis: 'Offentlige levende wikier',
        seeAll: 'Se alle',
        signIn: 'Logg inn',
        askFiveNoSignIn: 'Still opptil 5 spørsmål uten å logge inn',
        remainingQuestions: 'Still opptil 5 spørsmål uten å logge inn. {count} igjen.',
        suggestedQuestions: 'Foreslåtte spørsmål',
        reviewedLocations: 'Vurderte steder',
        trendingNow: 'Trender nå',
        askCityInternet: 'Spør om nyheter i {city}, nabolag, transport, mat, jobber, sikkerhet, arrangementer og samfunnsliv...',
        heroInternetPrompt: 'Spør om hva som helst med full internettkontekst og oppdaterte offentlige kilder.',
        latestUpdates: 'Siste oppdateringer',
        latestUpdatesPrompt: 'Hva er de siste oppdateringene om {city}?',
        whatMattersNow: 'Hva er viktig nå',
        recentDebates: 'Nylige debatter',
        backgroundContext: 'Bakgrunnskontekst',
        reviewedPlacesCount: '{count} vurderte steder',
        guideLabel: 'Din guide for Levende wiki {city}',
        chatTitle: '{city}-chat',
        live: 'Direkte',
      },
      sv: {
        weSpeakYourLanguage: 'Vi talar ditt språk',
        voiceHintManual: '{count} länder · välj en flagga först.',
        findCountry: 'Sök land',
        choose: 'Välj',
        askLivingWiki: 'Fråga Levande wiki',
        joinForFree: 'Gå med gratis',
        newChat: 'Ny chatt',
        exploreCities: 'Utforska städer',
        publicLivingWikis: 'Offentliga levande wikier',
        seeAll: 'Visa alla',
        signIn: 'Logga in',
        askFiveNoSignIn: 'Ställ upp till 5 frågor utan att logga in',
        remainingQuestions: 'Ställ upp till 5 frågor utan att logga in. {count} kvar.',
        suggestedQuestions: 'Föreslagna frågor',
        reviewedLocations: 'Recenserade platser',
        trendingNow: 'Populärt nu',
        askCityInternet: 'Fråga om nyheter i {city}, stadsdelar, trafik, mat, jobb, säkerhet, evenemang och samhällsliv...',
        heroInternetPrompt: 'Fråga vad som helst med full internetkontext och aktuella offentliga källor.',
        latestUpdates: 'Senaste uppdateringarna',
        latestUpdatesPrompt: 'Vilka är de senaste uppdateringarna om {city}?',
        whatMattersNow: 'Vad är viktigt nu',
        recentDebates: 'Senaste debatter',
        backgroundContext: 'Bakgrund',
        reviewedPlacesCount: '{count} recenserade platser',
        guideLabel: 'Din guide för Levande wiki {city}',
        chatTitle: '{city}-chatt',
        live: 'Live',
      },
      tr: {
        weSpeakYourLanguage: 'Dilinizde konuşuyoruz',
        voiceHintManual: '{count} ülke · önce bir bayrak seçin.',
        findCountry: 'Ülke ara',
        choose: 'Seç',
        askLivingWiki: 'Yaşayan Viki’ye Sor',
        joinForFree: 'Ücretsiz katıl',
        newChat: 'Yeni sohbet',
        exploreCities: 'Şehirleri keşfet',
        publicLivingWikis: 'Herkese açık yaşayan vikiler',
        seeAll: 'Tümünü gör',
        signIn: 'Giriş yap',
        askFiveNoSignIn: 'Giriş yapmadan en fazla 5 soru sor',
        remainingQuestions: 'Giriş yapmadan en fazla 5 soru sor. {count} kaldı.',
        suggestedQuestions: 'Önerilen sorular',
        reviewedLocations: 'İncelenen yerler',
        trendingNow: 'Şu anda trend',
        askCityInternet: '{city} haberleri, mahalleler, ulaşım, yemek, işler, güvenlik, etkinlikler ve kent yaşamı hakkında sor...',
        heroInternetPrompt: 'Tam internet bağlamı ve güncel herkese açık kaynaklarla istediğini sor.',
        latestUpdates: 'Son güncellemeler',
        latestUpdatesPrompt: '{city} hakkında son güncellemeler neler?',
        whatMattersNow: 'Şimdi önemli olan',
        recentDebates: 'Son tartışmalar',
        backgroundContext: 'Genel arka plan',
        reviewedPlacesCount: '{count} incelenen yer',
        guideLabel: 'Yaşayan Viki {city} rehberin',
        chatTitle: '{city} sohbeti',
        live: 'Canlı',
	      },
	    };
	    const completionPacks: Record<string, Partial<Record<ChatUiTextKey, string>>> = {
	      fr: {
	        askFiveNoSignInPeriod: 'Posez jusqu’à 5 questions sans vous connecter.',
	        chat: 'Chat',
	        threads: 'Conversations',
	        noThreadsYet: 'Aucune conversation pour le moment.',
	        signOut: 'Se déconnecter',
	        voiceMode: 'Mode vocal',
	        copyChat: 'Copier le chat',
	        copied: 'Copié',
	        copy: 'Copier',
	        close: 'Fermer',
	        cancel: 'Annuler',
	        done: 'Terminé',
	        chooseLanguagePrompt: 'Choisissez un drapeau pour passer {city} dans votre langue.',
	        selectFlagFirst: 'Choisissez d’abord un drapeau',
	        speakInLanguage: 'Parlez-moi en {language}',
	        language: 'Langue',
	        voiceModeSelected: 'Mode vocal sélectionné',
	        startVoiceModeIn: 'Démarrer le mode vocal en {language}',
	        findCountry: 'Trouver un pays',
	        choose: 'Choisir',
	      },
	      de: {
	        askFiveNoSignInPeriod: 'Bis zu 5 Fragen ohne Anmeldung stellen.',
	        chat: 'Chat',
	        threads: 'Verläufe',
	        noThreadsYet: 'Noch keine Verläufe.',
	        signOut: 'Abmelden',
	        voiceMode: 'Sprachmodus',
	        copyChat: 'Chat kopieren',
	        copied: 'Kopiert',
	        copy: 'Kopieren',
	        close: 'Schließen',
	        cancel: 'Abbrechen',
	        done: 'Fertig',
	        chooseLanguagePrompt: 'Wähle eine Flagge, um {city} in deine Sprache umzuschalten.',
	        selectFlagFirst: 'Wähle zuerst eine Flagge',
	        speakInLanguage: 'Sprich mit mir auf {language}',
	        language: 'Sprache',
	        voiceModeSelected: 'Sprachmodus ausgewählt',
	        startVoiceModeIn: 'Sprachmodus auf {language} starten',
	        findCountry: 'Land suchen',
	        choose: 'Auswählen',
	      },
	      pt: {
	        askFiveNoSignInPeriod: 'Faça até 5 perguntas sem entrar.',
	        chat: 'Chat',
	        threads: 'Conversas',
	        noThreadsYet: 'Ainda não há conversas.',
	        signOut: 'Sair',
	        voiceMode: 'Modo de voz',
	        copyChat: 'Copiar chat',
	        copied: 'Copiado',
	        copy: 'Copiar',
	        close: 'Fechar',
	        cancel: 'Cancelar',
	        done: 'Concluído',
	        chooseLanguagePrompt: 'Escolha uma bandeira para mudar {city} para o seu idioma.',
	        selectFlagFirst: 'Escolha uma bandeira primeiro',
	        speakInLanguage: 'Fale comigo em {language}',
	        language: 'Idioma',
	        voiceModeSelected: 'Modo de voz selecionado',
	        startVoiceModeIn: 'Iniciar modo de voz em {language}',
	        findCountry: 'Encontrar país',
	        choose: 'Escolher',
	      },
	      nl: {
	        loadingChat: 'Chat laden',
	        preparingConversation: 'Dit atlasgesprek wordt voorbereid.',
	        emailAddress: 'E-mailadres',
	        joining: 'Deelnemen...',
	        answerMode: 'Antwoordmodus',
	        wiki: 'Wiki',
	        internet: 'Internet',
	        toSend: 'om te verzenden',
	        signInToContinue: 'Log in om door te gaan',
	        sendMessage: 'Bericht verzenden',
	        signInToSaveChat: 'Log in om de chat op te slaan',
	        subscribeWeeklyUpdates: 'Abonneren op wekelijkse updates',
	        openPlacesBoard: 'Plaatsenbord openen',
	        noLocalReviewsYet: 'Nog geen lokale reviews',
	        openBoardFirstPlace: 'Open het bord om de eerste plek toe te voegen.',
	        subscribe: 'Abonneren',
	        messageLivingWiki: 'Bericht aan Levende Wiki...',
	        publicLimitReached: 'Openbare vragenlimiet bereikt',
	        askFiveNoSignInPeriod: 'Stel tot 5 vragen zonder in te loggen.',
	        internetModeLabel: 'Internetmodus',
	        myLivingWikiLabel: 'Levende Wiki',
	        internetModeHelper: 'Internetmodus zoekt op het web en antwoordt voorbij je geüploade bronnen.',
	        reviewedPlaceCount: '1 beoordeelde plaats',
	        preview: 'Voorbeeld',
	        chat: 'Chat',
	        threads: 'Gesprekken',
	        noThreadsYet: 'Nog geen gesprekken.',
	        signOut: 'Uitloggen',
	        voiceMode: 'Spraakmodus',
	        copyChat: 'Chat kopiëren',
	        copied: 'Gekopieerd',
	        copy: 'Kopiëren',
	        close: 'Sluiten',
	        cancel: 'Annuleren',
	        done: 'Klaar',
	        chooseLanguagePrompt: 'Kies een vlag om {city} naar je taal te schakelen.',
	        selectFlagFirst: 'Kies eerst een vlag',
	        speakInLanguage: 'Praat met mij in {language}',
	        language: 'Taal',
	        voiceModeSelected: 'Spraakmodus geselecteerd',
	        startVoiceModeIn: 'Start spraakmodus in {language}',
	      },
	      ar: {
	        subscribeWeeklyUpdates: 'اشترك في التحديثات الأسبوعية',
	        openPlacesBoard: 'افتح لوحة الأماكن',
	        noLocalReviewsYet: 'لا توجد مراجعات محلية بعد',
	        openBoardFirstPlace: 'افتح اللوحة لإضافة المكان الأول.',
	        subscribe: 'اشترك',
	        messageLivingWiki: 'رسالة إلى ويكي الحي...',
	        publicLimitReached: 'تم بلوغ حد الأسئلة العامة',
	        askFiveNoSignInPeriod: 'اطرح حتى 5 أسئلة دون تسجيل الدخول.',
	        reviewedPlaceCount: 'مكان واحد تمت مراجعته',
	        preview: 'معاينة',
	        chat: 'دردشة',
	        threads: 'المحادثات',
	        noThreadsYet: 'لا توجد محادثات بعد.',
	        signOut: 'تسجيل الخروج',
	        voiceMode: 'وضع الصوت',
	        copyChat: 'نسخ الدردشة',
	        copied: 'تم النسخ',
	        copy: 'نسخ',
	        close: 'إغلاق',
	        cancel: 'إلغاء',
	        done: 'تم',
	        chooseLanguagePrompt: 'اختر علماً لتحويل {city} إلى لغتك.',
	        selectFlagFirst: 'اختر علماً أولاً',
	        speakInLanguage: 'تحدث معي باللغة {language}',
	        language: 'اللغة',
	        voiceModeSelected: 'تم اختيار وضع الصوت',
	        startVoiceModeIn: 'بدء وضع الصوت باللغة {language}',
	        findCountry: 'ابحث عن بلد',
	        choose: 'اختر',
	      },
	      zh: {
	        subscribeWeeklyUpdates: '订阅每周更新',
	        openPlacesBoard: '打开地点看板',
	        noLocalReviewsYet: '暂无本地评价',
	        openBoardFirstPlace: '打开看板添加第一个地点。',
	        subscribe: '订阅',
	        messageLivingWiki: '给我的活 wiki 留言...',
	        publicLimitReached: '已达到公开提问限制',
	        askFiveNoSignInPeriod: '无需登录即可提问最多 5 个问题。',
	        reviewedPlaceCount: '1 个已评价地点',
	        preview: '预览',
	        chat: '聊天',
	        threads: '对话',
	        noThreadsYet: '还没有对话。',
	        signOut: '退出登录',
	        voiceMode: '语音模式',
	        copyChat: '复制聊天',
	        copied: '已复制',
	        copy: '复制',
	        close: '关闭',
	        cancel: '取消',
	        done: '完成',
	        chooseLanguagePrompt: '选择一面旗帜，将 {city} 切换为你的语言。',
	        selectFlagFirst: '请先选择旗帜',
	        speakInLanguage: '用 {language} 和我说话',
	        language: '语言',
	        voiceModeSelected: '已选择语音模式',
	        startVoiceModeIn: '用 {language} 开始语音模式',
	        findCountry: '查找国家',
	        choose: '选择',
	      },
	      ja: {
	        loadingChat: 'チャットを読み込み中',
	        preparingConversation: 'このアトラスの会話を準備しています。',
	        emailAddress: 'メールアドレス',
	        joining: '参加中...',
	        weeklyUpdates: '週次アップデートで最新情報を確認できます。',
	        answerMode: '回答モード',
	        wiki: 'ウィキ',
	        internet: 'インターネット',
	        toSend: 'で送信',
	        signInToContinue: '続けるにはサインイン',
	        sendMessage: 'メッセージを送信',
	        signInToSaveChat: 'チャットを保存するにはサインイン',
	        subscribeWeeklyUpdates: '週次アップデートを購読',
	        openPlacesBoard: '場所ボードを開く',
	        noLocalReviewsYet: 'ローカルレビューはまだありません',
	        openBoardFirstPlace: 'ボードを開いて最初の場所を追加してください。',
	        subscribe: '購読',
	        messageLivingWiki: 'リビング・ウィキへメッセージ...',
	        publicLimitReached: '公開質問の上限に達しました',
	        askFiveNoSignInPeriod: 'サインインせずに最大5件まで質問できます。',
	        internetModeLabel: 'インターネットモード',
	        myLivingWikiLabel: 'リビング・ウィキ',
	        internetModeHelper: 'インターネットモードはウェブを検索し、アップロード済みソースを超えて回答します。',
	        reviewedPlaceCount: '1件のレビュー済みスポット',
	        preview: 'プレビュー',
	        chat: 'チャット',
	        threads: 'スレッド',
	        noThreadsYet: 'スレッドはまだありません。',
	        signOut: 'サインアウト',
	        voiceMode: '音声モード',
	        copyChat: 'チャットをコピー',
	        copied: 'コピー済み',
	        copy: 'コピー',
	        close: '閉じる',
	        cancel: 'キャンセル',
	        done: '完了',
	        chooseLanguagePrompt: '旗を選んで {city} をあなたの言語に切り替えます。',
	        selectFlagFirst: 'まず旗を選択してください',
	        speakInLanguage: '{language} で話してください',
	        language: '言語',
	        voiceModeSelected: '音声モードを選択中',
	        startVoiceModeIn: '{language} で音声モードを開始',
	      },
	      ko: {
	        loadingChat: '채팅 불러오는 중',
	        preparingConversation: '이 아틀라스 대화를 준비하고 있습니다.',
	        emailAddress: '이메일 주소',
	        joining: '참여 중...',
	        weeklyUpdates: '주간 업데이트로 계속 확인하세요.',
	        answerMode: '응답 모드',
	        wiki: '위키',
	        internet: '인터넷',
	        toSend: '눌러 보내기',
	        signInToContinue: '계속하려면 로그인',
	        sendMessage: '메시지 보내기',
	        signInToSaveChat: '채팅을 저장하려면 로그인',
	        subscribeWeeklyUpdates: '주간 업데이트 구독',
	        openPlacesBoard: '장소 보드 열기',
	        noLocalReviewsYet: '아직 로컬 리뷰가 없습니다',
	        openBoardFirstPlace: '첫 장소를 추가하려면 보드를 여세요.',
	        subscribe: '구독',
	        messageLivingWiki: '살아있는 위키에 메시지...',
	        publicLimitReached: '공개 질문 한도에 도달했습니다',
	        askFiveNoSignInPeriod: '로그인 없이 최대 5개 질문 가능.',
	        internetModeLabel: '인터넷 모드',
	        myLivingWikiLabel: '살아있는 위키',
	        internetModeHelper: '인터넷 모드는 웹을 검색하고 업로드한 출처를 넘어 답합니다.',
	        reviewedPlaceCount: '리뷰된 장소 1개',
	        preview: '미리보기',
	        chat: '채팅',
	        threads: '대화',
	        noThreadsYet: '아직 대화가 없습니다.',
	        signOut: '로그아웃',
	        voiceMode: '음성 모드',
	        copyChat: '채팅 복사',
	        copied: '복사됨',
	        copy: '복사',
	        close: '닫기',
	        cancel: '취소',
	        done: '완료',
	        chooseLanguagePrompt: '깃발을 선택해 {city}를 당신의 언어로 전환하세요.',
	        selectFlagFirst: '먼저 깃발을 선택하세요',
	        speakInLanguage: '{language}로 말해 주세요',
	        language: '언어',
	        voiceModeSelected: '음성 모드 선택됨',
	        startVoiceModeIn: '{language}로 음성 모드 시작',
	      },
	      ru: {
	        loadingChat: 'Загрузка чата',
	        preparingConversation: 'Подготавливаем разговор этого атласа.',
	        emailAddress: 'Адрес электронной почты',
	        joining: 'Присоединение...',
	        weeklyUpdates: 'Еженедельные обновления, чтобы быть в курсе.',
	        answerMode: 'Режим ответа',
	        wiki: 'Вики',
	        internet: 'Интернет',
	        toSend: 'для отправки',
	        signInToContinue: 'Войдите, чтобы продолжить',
	        sendMessage: 'Отправить сообщение',
	        signInToSaveChat: 'Войдите, чтобы сохранить чат',
	        subscribeWeeklyUpdates: 'Подписаться на еженедельные обновления',
	        openPlacesBoard: 'Открыть доску мест',
	        noLocalReviewsYet: 'Пока нет местных отзывов',
	        openBoardFirstPlace: 'Откройте доску, чтобы добавить первое место.',
	        subscribe: 'Подписаться',
	        messageLivingWiki: 'Сообщение Моей живой вики...',
	        publicLimitReached: 'Достигнут лимит публичных вопросов',
	        askFiveNoSignInPeriod: 'Задайте до 5 вопросов без входа.',
	        internetModeLabel: 'Интернет-режим',
	        myLivingWikiLabel: 'Живая вики',
	        internetModeHelper: 'Интернет-режим ищет в сети и отвечает за пределами ваших загруженных источников.',
	        reviewedPlaceCount: '1 место с отзывом',
	        preview: 'Предпросмотр',
	        chat: 'Чат',
	        threads: 'Беседы',
	        noThreadsYet: 'Бесед пока нет.',
	        signOut: 'Выйти',
	        voiceMode: 'Голосовой режим',
	        copyChat: 'Копировать чат',
	        copied: 'Скопировано',
	        copy: 'Копировать',
	        close: 'Закрыть',
	        cancel: 'Отмена',
	        done: 'Готово',
	        chooseLanguagePrompt: 'Выберите флаг, чтобы переключить {city} на ваш язык.',
	        selectFlagFirst: 'Сначала выберите флаг',
	        speakInLanguage: 'Говорите со мной на {language}',
	        language: 'Язык',
	        voiceModeSelected: 'Выбран голосовой режим',
	        startVoiceModeIn: 'Запустить голосовой режим на {language}',
	      },
	      hi: {
	        loadingChat: 'चैट लोड हो रही है',
	        preparingConversation: 'इस एटलस बातचीत को तैयार किया जा रहा है।',
	        emailAddress: 'ईमेल पता',
	        joining: 'जुड़ रहे हैं...',
	        weeklyUpdates: 'अपडेट रहने के लिए साप्ताहिक अपडेट।',
	        guideAlt: 'जीवित विकी गाइड',
	        answerMode: 'उत्तर मोड',
	        wiki: 'विकी',
	        internet: 'इंटरनेट',
	        toSend: 'भेजने के लिए',
	        signInToContinue: 'जारी रखने के लिए साइन इन करें',
	        sendMessage: 'संदेश भेजें',
	        signInToSaveChat: 'चैट सहेजने के लिए साइन इन करें',
	        subscribeWeeklyUpdates: 'साप्ताहिक अपडेट लें',
	        openPlacesBoard: 'स्थान बोर्ड खोलें',
	        noLocalReviewsYet: 'अभी कोई स्थानीय समीक्षा नहीं',
	        openBoardFirstPlace: 'पहला स्थान जोड़ने के लिए बोर्ड खोलें।',
	        subscribe: 'सदस्यता लें',
	        messageLivingWiki: 'जीवित विकी को संदेश...',
	        publicLimitReached: 'सार्वजनिक प्रश्न सीमा पूरी हुई',
	        askFiveNoSignInPeriod: 'साइन इन किए बिना 5 प्रश्न तक पूछें।',
	        internetModeLabel: 'इंटरनेट मोड',
	        myLivingWikiLabel: 'जीवित विकी',
	        internetModeHelper: 'इंटरनेट मोड वेब खोजता है और आपके अपलोड किए स्रोतों से आगे जवाब देता है।',
	        recentDebatesPrompt: 'लोग अभी {city} के बारे में क्या बहस कर रहे हैं?',
	        backgroundContextPrompt: 'सार्वजनिक स्रोतों से {city} की पृष्ठभूमि बताएं।',
	        reviewedPlaceCount: '1 समीक्षित स्थान',
	        localReviewCount: '1 स्थानीय समीक्षा',
	        localReviewsCount: '{count} स्थानीय समीक्षाएँ',
	        preview: 'पूर्वावलोकन',
	        chat: 'चैट',
	        threads: 'बातचीत',
	        noThreadsYet: 'अभी कोई बातचीत नहीं।',
	        signOut: 'साइन आउट',
	        voiceMode: 'वॉइस मोड',
	        copyChat: 'चैट कॉपी करें',
	        copied: 'कॉपी हो गया',
	        copy: 'कॉपी',
	        close: 'बंद करें',
	        cancel: 'रद्द करें',
	        done: 'हो गया',
	        chooseLanguagePrompt: '{city} को अपनी भाषा में बदलने के लिए झंडा चुनें।',
	        selectFlagFirst: 'पहले एक झंडा चुनें',
	        speakInLanguage: 'मुझसे {language} में बात करें',
	        language: 'भाषा',
	        voiceModeSelected: 'वॉइस मोड चुना गया',
	        startVoiceModeIn: '{language} में वॉइस मोड शुरू करें',
	      },
	      cs: {
	        loadingChat: 'Načítání chatu',
	        preparingConversation: 'Připravuje se tato konverzace atlasu.',
	        emailAddress: 'E-mailová adresa',
	        joining: 'Připojování...',
	        weeklyUpdates: 'Týdenní aktuality, abyste zůstali v obraze.',
	        guideAlt: 'Průvodce Mé živé wiki',
	        answerMode: 'Režim odpovědi',
	        wiki: 'Wiki',
	        internet: 'Internet',
	        toSend: 'pro odeslání',
	        signInToContinue: 'Přihlaste se a pokračujte',
	        sendMessage: 'Odeslat zprávu',
	        signInToSaveChat: 'Přihlaste se pro uložení chatu',
	        subscribeWeeklyUpdates: 'Odebírat týdenní aktuality',
	        openPlacesBoard: 'Otevřít tabuli míst',
	        noLocalReviewsYet: 'Zatím žádné místní recenze',
	        openBoardFirstPlace: 'Otevřete tabuli a přidejte první místo.',
	        subscribe: 'Odebírat',
	        messageLivingWiki: 'Zpráva pro Mou živou wiki...',
	        publicLimitReached: 'Dosažen limit veřejných otázek',
	        askFiveNoSignInPeriod: 'Položte až 5 otázek bez přihlášení.',
	        internetModeLabel: 'Internetový režim',
	        myLivingWikiLabel: 'Živá wiki',
	        internetModeHelper: 'Internetový režim prohledává web a odpovídá nad rámec nahraných zdrojů.',
	        whatMattersNowPrompt: 'Co bych měl teď vědět o {city}?',
	        recentDebatesPrompt: 'O čem lidé teď diskutují kolem {city}?',
	        backgroundContextPrompt: 'Dejte mi obecný kontext o {city} z veřejných zdrojů.',
	        reviewedPlaceCount: '1 hodnocené místo',
	        localReviewCount: '1 místní recenze',
	        localReviewsCount: '{count} místních recenzí',
	        preview: 'Náhled',
	        chat: 'Chat',
	        threads: 'Konverzace',
	        noThreadsYet: 'Zatím žádné konverzace.',
	        signOut: 'Odhlásit se',
	        voiceMode: 'Hlasový režim',
	        copyChat: 'Kopírovat chat',
	        copied: 'Zkopírováno',
	        copy: 'Kopírovat',
	        close: 'Zavřít',
	        cancel: 'Zrušit',
	        done: 'Hotovo',
	        chooseLanguagePrompt: 'Vyberte vlajku a přepněte {city} do svého jazyka.',
	        selectFlagFirst: 'Nejprve vyberte vlajku',
	        speakInLanguage: 'Mluvte se mnou v jazyce {language}',
	        language: 'Jazyk',
	        voiceModeSelected: 'Hlasový režim vybrán',
	        startVoiceModeIn: 'Spustit hlasový režim v jazyce {language}',
	      },
	      hr: {
	        loadingChat: 'Učitavanje chata',
	        preparingConversation: 'Priprema se ovaj razgovor atlasa.',
	        emailAddress: 'Adresa e-pošte',
	        joining: 'Pridruživanje...',
	        weeklyUpdates: 'Tjedne novosti da ostanete u toku.',
	        guideAlt: 'Vodič Živi wiki',
	        answerMode: 'Način odgovora',
	        wiki: 'Wiki',
	        internet: 'Internet',
	        toSend: 'za slanje',
	        signInToContinue: 'Prijavite se za nastavak',
	        sendMessage: 'Pošalji poruku',
	        signInToSaveChat: 'Prijavite se za spremanje chata',
	        subscribeWeeklyUpdates: 'Pretplati se na tjedne novosti',
	        openPlacesBoard: 'Otvori ploču mjesta',
	        noLocalReviewsYet: 'Još nema lokalnih recenzija',
	        openBoardFirstPlace: 'Otvorite ploču za dodavanje prvog mjesta.',
	        subscribe: 'Pretplati se',
	        messageLivingWiki: 'Poruka za Živi wiki...',
	        publicLimitReached: 'Dosegnuto je ograničenje javnih pitanja',
	        askFiveNoSignInPeriod: 'Postavite do 5 pitanja bez prijave.',
	        internetModeLabel: 'Internetski način',
	        myLivingWikiLabel: 'Živi wiki',
	        internetModeHelper: 'Internetski način pretražuje web i odgovara izvan vaših učitanih izvora.',
	        whatMattersNowPrompt: 'Što sada trebam znati o {city}?',
	        recentDebatesPrompt: 'O čemu ljudi sada raspravljaju u vezi s {city}?',
	        backgroundContextPrompt: 'Daj mi širi kontekst o {city} iz javnih izvora.',
	        reviewedPlaceCount: '1 recenzirano mjesto',
	        localReviewCount: '1 lokalna recenzija',
	        localReviewsCount: '{count} lokalnih recenzija',
	        preview: 'Pregled',
	        chat: 'Chat',
	        threads: 'Razgovori',
	        noThreadsYet: 'Još nema razgovora.',
	        signOut: 'Odjava',
	        voiceMode: 'Glasovni način',
	        copyChat: 'Kopiraj chat',
	        copied: 'Kopirano',
	        copy: 'Kopiraj',
	        close: 'Zatvori',
	        cancel: 'Odustani',
	        done: 'Gotovo',
	        chooseLanguagePrompt: 'Odaberite zastavu da prebacite {city} na svoj jezik.',
	        selectFlagFirst: 'Prvo odaberite zastavu',
	        speakInLanguage: 'Razgovarajte sa mnom na {language}',
	        language: 'Jezik',
	        voiceModeSelected: 'Glasovni način odabran',
	        startVoiceModeIn: 'Pokreni glasovni način na {language}',
	      },
	      fa: {
	        loadingChat: 'در حال بارگذاری گفتگو',
	        preparingConversation: 'در حال آماده‌سازی گفتگوی این اطلس.',
	        emailAddress: 'نشانی ایمیل',
	        joining: 'در حال پیوستن...',
	        weeklyUpdates: 'به‌روزرسانی‌های هفتگی برای آگاه ماندن.',
	        guideAlt: 'راهنمای ویکی زنده',
	        answerMode: 'حالت پاسخ',
	        wiki: 'ویکی',
	        internet: 'اینترنت',
	        toSend: 'برای ارسال',
	        signInToContinue: 'برای ادامه وارد شوید',
	        sendMessage: 'ارسال پیام',
	        signInToSaveChat: 'برای ذخیره گفتگو وارد شوید',
	        subscribeWeeklyUpdates: 'اشتراک به‌روزرسانی‌های هفتگی',
	        openPlacesBoard: 'باز کردن تابلوی مکان‌ها',
	        noLocalReviewsYet: 'هنوز بررسی محلی وجود ندارد',
	        openBoardFirstPlace: 'تابلو را باز کنید تا اولین مکان را اضافه کنید.',
	        subscribe: 'اشتراک',
	        messageLivingWiki: 'پیام به ویکی زنده...',
	        publicLimitReached: 'حد پرسش عمومی تمام شد',
	        askFiveNoSignInPeriod: 'بدون ورود تا ۵ پرسش بپرسید.',
	        internetModeLabel: 'حالت اینترنت',
	        myLivingWikiLabel: 'ویکی زنده',
	        internetModeHelper: 'حالت اینترنت وب را جستجو می‌کند و فراتر از منابع بارگذاری‌شده شما پاسخ می‌دهد.',
	        whatMattersNowPrompt: 'اکنون باید درباره {city} چه بدانم؟',
	        recentDebatesPrompt: 'اکنون مردم درباره {city} چه بحث می‌کنند؟',
	        backgroundContextPrompt: 'از منابع عمومی زمینه کلی درباره {city} بدهید.',
	        reviewedPlaceCount: '۱ مکان بررسی‌شده',
	        localReviewCount: '۱ بررسی محلی',
	        localReviewsCount: '{count} بررسی محلی',
	        preview: 'پیش‌نمایش',
	        chat: 'گفتگو',
	        threads: 'رشته‌ها',
	        noThreadsYet: 'هنوز رشته‌ای نیست.',
	        signOut: 'خروج',
	        voiceMode: 'حالت صوتی',
	        copyChat: 'کپی گفتگو',
	        copied: 'کپی شد',
	        copy: 'کپی',
	        close: 'بستن',
	        cancel: 'لغو',
	        done: 'انجام شد',
	        chooseLanguagePrompt: 'یک پرچم انتخاب کنید تا {city} به زبان شما تغییر کند.',
	        selectFlagFirst: 'ابتدا یک پرچم انتخاب کنید',
	        speakInLanguage: 'با من به {language} صحبت کنید',
	        language: 'زبان',
	        voiceModeSelected: 'حالت صوتی انتخاب شد',
	        startVoiceModeIn: 'شروع حالت صوتی به {language}',
	      },
	      no: {
	        loadingChat: 'Laster chat',
	        preparingConversation: 'Forbereder denne atlas-samtalen.',
	        emailAddress: 'E-postadresse',
	        joining: 'Blir med...',
	        weeklyUpdates: 'Ukentlige oppdateringer for å holde deg orientert.',
	        guideAlt: 'Guide for Levende wiki',
	        answerMode: 'Svarmodus',
	        wiki: 'Wiki',
	        internet: 'Internett',
	        toSend: 'for å sende',
	        signInToContinue: 'Logg inn for å fortsette',
	        sendMessage: 'Send melding',
	        signInToSaveChat: 'Logg inn for å lagre chatten',
	        subscribeWeeklyUpdates: 'Abonner på ukentlige oppdateringer',
	        openPlacesBoard: 'Åpne stedstavlen',
	        noLocalReviewsYet: 'Ingen lokale anmeldelser ennå',
	        openBoardFirstPlace: 'Åpne tavlen for å legge til det første stedet.',
	        subscribe: 'Abonner',
	        messageLivingWiki: 'Melding til Levende wiki...',
	        publicLimitReached: 'Grensen for offentlige spørsmål er nådd',
	        askFiveNoSignInPeriod: 'Still opptil 5 spørsmål uten å logge inn.',
	        internetModeLabel: 'Internettmodus',
	        myLivingWikiLabel: 'Levende wiki',
	        internetModeHelper: 'Internettmodus søker på nettet og svarer utover de opplastede kildene dine.',
	        whatMattersNowPrompt: 'Hva bør jeg vite akkurat nå om {city}?',
	        recentDebatesPrompt: 'Hva diskuterer folk om {city} akkurat nå?',
	        backgroundContextPrompt: 'Gi meg bakgrunnskontekst om {city} fra offentlige kilder.',
	        reviewedPlaceCount: '1 vurdert sted',
	        localReviewCount: '1 lokal anmeldelse',
	        localReviewsCount: '{count} lokale anmeldelser',
	        preview: 'Forhåndsvisning',
	        chat: 'Chat',
	        threads: 'Samtaler',
	        noThreadsYet: 'Ingen samtaler ennå.',
	        signOut: 'Logg ut',
	        voiceMode: 'Talemodus',
	        copyChat: 'Kopier chat',
	        copied: 'Kopiert',
	        copy: 'Kopier',
	        close: 'Lukk',
	        cancel: 'Avbryt',
	        done: 'Ferdig',
	        chooseLanguagePrompt: 'Velg et flagg for å bytte {city} til språket ditt.',
	        selectFlagFirst: 'Velg et flagg først',
	        speakInLanguage: 'Snakk med meg på {language}',
	        language: 'Språk',
	        voiceModeSelected: 'Talemodus valgt',
	        startVoiceModeIn: 'Start talemodus på {language}',
	      },
	      sv: {
	        loadingChat: 'Laddar chatt',
	        preparingConversation: 'Förbereder den här atlas-konversationen.',
	        emailAddress: 'E-postadress',
	        joining: 'Går med...',
	        weeklyUpdates: 'Veckouppdateringar så att du håller dig informerad.',
	        guideAlt: 'Guide för Levande wiki',
	        answerMode: 'Svarsläge',
	        wiki: 'Wiki',
	        internet: 'Internet',
	        toSend: 'för att skicka',
	        signInToContinue: 'Logga in för att fortsätta',
	        sendMessage: 'Skicka meddelande',
	        signInToSaveChat: 'Logga in för att spara chatten',
	        subscribeWeeklyUpdates: 'Prenumerera på veckouppdateringar',
	        openPlacesBoard: 'Öppna platsstavlan',
	        noLocalReviewsYet: 'Inga lokala recensioner än',
	        openBoardFirstPlace: 'Öppna tavlan för att lägga till den första platsen.',
	        subscribe: 'Prenumerera',
	        messageLivingWiki: 'Meddelande till Levande wiki...',
	        publicLimitReached: 'Gränsen för offentliga frågor är nådd',
	        askFiveNoSignInPeriod: 'Ställ upp till 5 frågor utan att logga in.',
	        internetModeLabel: 'Internetläge',
	        myLivingWikiLabel: 'Levande wiki',
	        internetModeHelper: 'Internetläge söker på webben och svarar bortom dina uppladdade källor.',
	        whatMattersNowPrompt: 'Vad bör jag veta just nu om {city}?',
	        recentDebatesPrompt: 'Vad debatterar människor om {city} just nu?',
	        backgroundContextPrompt: 'Ge mig bakgrund om {city} från offentliga källor.',
	        reviewedPlaceCount: '1 recenserad plats',
	        localReviewCount: '1 lokal recension',
	        localReviewsCount: '{count} lokala recensioner',
	        preview: 'Förhandsvisning',
	        chat: 'Chatt',
	        threads: 'Konversationer',
	        noThreadsYet: 'Inga konversationer än.',
	        signOut: 'Logga ut',
	        voiceMode: 'Röstläge',
	        copyChat: 'Kopiera chatt',
	        copied: 'Kopierat',
	        copy: 'Kopiera',
	        close: 'Stäng',
	        cancel: 'Avbryt',
	        done: 'Klart',
	        chooseLanguagePrompt: 'Välj en flagga för att byta {city} till ditt språk.',
	        selectFlagFirst: 'Välj en flagga först',
	        speakInLanguage: 'Prata med mig på {language}',
	        language: 'Språk',
	        voiceModeSelected: 'Röstläge valt',
	        startVoiceModeIn: 'Starta röstläge på {language}',
	      },
	      tr: {
	        loadingChat: 'Sohbet yükleniyor',
	        preparingConversation: 'Bu atlas sohbeti hazırlanıyor.',
	        emailAddress: 'E-posta adresi',
	        joining: 'Katılıyor...',
	        weeklyUpdates: 'Gündemde kalmak için haftalık güncellemeler.',
	        guideAlt: 'Yaşayan Viki rehberi',
	        answerMode: 'Yanıt modu',
	        wiki: 'Viki',
	        internet: 'İnternet',
	        toSend: 'göndermek için',
	        signInToContinue: 'Devam etmek için giriş yap',
	        sendMessage: 'Mesaj gönder',
	        signInToSaveChat: 'Sohbeti kaydetmek için giriş yap',
	        subscribeWeeklyUpdates: 'Haftalık güncellemelere abone ol',
	        openPlacesBoard: 'Yerler panosunu aç',
	        noLocalReviewsYet: 'Henüz yerel yorum yok',
	        openBoardFirstPlace: 'İlk yeri eklemek için panoyu açın.',
	        subscribe: 'Abone ol',
	        messageLivingWiki: 'Yaşayan Viki’ye mesaj...',
	        publicLimitReached: 'Herkese açık soru sınırına ulaşıldı',
	        askFiveNoSignInPeriod: 'Giriş yapmadan en fazla 5 soru sor.',
	        internetModeLabel: 'İnternet modu',
	        myLivingWikiLabel: 'Yaşayan Viki',
	        internetModeHelper: 'İnternet modu webde arama yapar ve yüklediğiniz kaynakların ötesinde yanıt verir.',
	        whatMattersNowPrompt: 'Şu anda {city} hakkında ne bilmeliyim?',
	        recentDebatesPrompt: 'İnsanlar şu anda {city} hakkında ne tartışıyor?',
	        backgroundContextPrompt: 'Herkese açık kaynaklardan {city} hakkında genel arka plan ver.',
	        reviewedPlaceCount: '1 incelenen yer',
	        localReviewCount: '1 yerel yorum',
	        localReviewsCount: '{count} yerel yorum',
	        preview: 'Önizleme',
	        chat: 'Sohbet',
	        threads: 'Konuşmalar',
	        noThreadsYet: 'Henüz konuşma yok.',
	        signOut: 'Çıkış yap',
	        voiceMode: 'Ses modu',
	        copyChat: 'Sohbeti kopyala',
	        copied: 'Kopyalandı',
	        copy: 'Kopyala',
	        close: 'Kapat',
	        cancel: 'İptal',
	        done: 'Bitti',
	        chooseLanguagePrompt: '{city} için dilinizi seçmek üzere bir bayrak seçin.',
	        selectFlagFirst: 'Önce bir bayrak seçin',
	        speakInLanguage: 'Benimle {language} konuş',
	        language: 'Dil',
	        voiceModeSelected: 'Ses modu seçildi',
	        startVoiceModeIn: '{language} ses modunu başlat',
	      },
	    };
	    return packs[normalized]?.[key] ?? completionPacks[normalized]?.[key];
	  }

  localizedCountryName(country: string): string {
    const trimmed = country.trim();
    if (!trimmed) {
      return '';
    }

    const countryCode = COUNTRY_NAME_TO_CODE[trimmed.toLowerCase()];
    if (!countryCode) {
      return trimmed;
    }

    try {
      const DisplayNames = (Intl as typeof Intl & {
        DisplayNames?: new (locales: string[], options: { type: 'region' }) => { of(code: string): string | undefined };
      }).DisplayNames;
      return DisplayNames
        ? new DisplayNames([this.localeForSelectedLanguage()], { type: 'region' }).of(countryCode) ?? trimmed
        : trimmed;
    } catch {
      return trimmed;
    }
  }

  localizedGuideLabel(label: string | undefined | null): string {
    const trimmed = label?.trim();
    const city = this.currentWikiName();
    if (!trimmed) {
      return city ? this.uiText('guideLabel', { city }) : this.uiText('guideAlt');
    }

    if (/living wiki/i.test(trimmed) && /tour guide|guide/i.test(trimmed)) {
      return city ? this.uiText('guideLabel', { city }) : this.uiText('guideAlt');
    }

    return trimmed;
  }

  private localeForSelectedLanguage(): string {
    const language = this.selectedVoiceLanguage();
    const code = language?.code ?? this.selectedPageLanguageCode();
    if (code === 'pt-br') {
      return 'pt-BR';
    }
    if (code === 'zh') {
      return 'zh-CN';
    }
    return code || 'en';
  }

  placeRatingLabel(place: CityReviewedPlace): string {
    const rating = place.ratingAvg ?? 0;
    const count = place.reviewCount ?? place.ratingCount ?? 0;
    if (!rating) {
      return count ? this.uiText('ratings', { count: `${count}` }) : this.uiText('newPlace');
    }
    return count ? `${rating.toFixed(1)} · ${count}` : rating.toFixed(1);
  }

  placeReviewCountLabel(place: CityReviewedPlace): string {
    const count = place.reviewCount ?? place.ratingCount ?? 0;
    if (!count) {
      return this.uiText('noLocalReviewsYet');
    }
    return this.uiText(count === 1 ? 'localReviewCount' : 'localReviewsCount', { count: `${count}` });
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
      const citySlug = this.routeSlug()?.trim();
      const businessSlug = this.routeBusinessSlug()?.trim();
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      this.businessClaim.set(null);
      this.businessClaimLookupDone.set(false);

      if (!citySlug || !businessSlug) {
        this.businessClaimLookupDone.set(true);
        return;
      }

      void this.businessClaimService
        .findByClaimKey(`${citySlug}__${businessSlug}`)
        .then((claim) => {
          if (!cancelled) {
            this.businessClaim.set(claim);
          }
        })
        .catch(() => {
          if (!cancelled) {
            this.businessClaim.set(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            this.businessClaimLookupDone.set(true);
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

    effect(() => {
      const shouldDetectVoiceLanguage = this.canShowCityVoiceCarousel() || (this.businessPageContext() && this.canStartRealtimeVoice());
      if (!shouldDetectVoiceLanguage || this.voiceLanguageDetectionStarted || this.voiceLanguageUserSelected) {
        return;
      }

      this.voiceLanguageDetectionStarted = true;
      void this.detectAndSelectVoiceLanguage();
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

  private async detectAndSelectVoiceLanguage(): Promise<void> {
    const location = await this.detectLanguageLocation();
    if (location) {
      this.detectedVoiceLanguageLocation.set(location);
    }

    if (this.voiceLanguageUserSelected || this.selectedVoiceLanguage()) {
      return;
    }

    const language = this.voiceLanguageForLocation(location) ?? this.voiceLanguageForBrowserLocale();
    if (!language) {
      return;
    }

    this.selectedVoiceLanguage.set(language);
    this.voiceLanguageAutoSelected.set(true);
    this.voiceLanguageSearch.set('');
    queueMicrotask(() => this.scrollSelectedVoiceLanguageIntoView());
  }

  private async detectLanguageLocation(): Promise<IpLanguageLocation | null> {
    const cached = this.readCachedLanguageLocation();
    if (cached) {
      return cached;
    }

    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
      return this.browserLanguageLocation();
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), 2200) : null;

    try {
      const response = await fetch(IP_LANGUAGE_LOCATION_URL, {
        signal: controller?.signal,
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`IP language lookup failed: ${response.status}`);
      }
      const payload = (await response.json()) as IpApiLocationResponse;
      const location: IpLanguageLocation = {
        countryCode: payload.country_code?.trim().toUpperCase() || null,
        countryName: payload.country_name?.trim() || null,
        source: 'ip',
      };
      this.writeCachedLanguageLocation(location);
      return location;
    } catch {
      return this.browserLanguageLocation();
    } finally {
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    }
  }

  private readCachedLanguageLocation(): IpLanguageLocation | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(IP_LANGUAGE_LOCATION_CACHE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { location?: IpLanguageLocation; cachedAt?: string };
      const cachedAt = parsed.cachedAt ? Date.parse(parsed.cachedAt) : 0;
      if (!parsed.location || !Number.isFinite(cachedAt) || Date.now() - cachedAt > 24 * 60 * 60 * 1000) {
        return null;
      }
      return parsed.location;
    } catch {
      return null;
    }
  }

  private writeCachedLanguageLocation(location: IpLanguageLocation): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(IP_LANGUAGE_LOCATION_CACHE_KEY, JSON.stringify({
        location,
        cachedAt: new Date().toISOString(),
      }));
    } catch {
      // Language detection is an enhancement; storage failures should not block chat.
    }
  }

  private browserLanguageLocation(): IpLanguageLocation {
    const locale = typeof navigator !== 'undefined'
      ? navigator.languages?.[0] || navigator.language || ''
      : '';
    const countryCode = locale.includes('-') ? locale.split('-').pop()?.toUpperCase() ?? null : null;
    return {
      countryCode,
      countryName: countryCode ? COUNTRY_CODE_TO_VOICE_COUNTRY[countryCode] ?? null : null,
      source: countryCode ? 'browser' : 'fallback',
    };
  }

  private voiceLanguageForLocation(location: IpLanguageLocation | null): VoiceLanguageOption | null {
    if (!location) {
      return null;
    }

    const countryCode = location.countryCode?.toUpperCase() ?? '';
    const mappedCountry = countryCode ? COUNTRY_CODE_TO_VOICE_COUNTRY[countryCode] : null;
    const countryName = mappedCountry || location.countryName;
    if (countryName) {
      const direct = this.voiceLanguages().find(
        (language) => language.country.toLowerCase() === countryName.toLowerCase(),
      );
      if (direct) {
        return direct;
      }
    }

    const mappedLanguageCode = countryCode ? COUNTRY_CODE_TO_VOICE_LANGUAGE[countryCode] : null;
    return mappedLanguageCode ? this.voiceLanguageForCode(mappedLanguageCode) : null;
  }

  private voiceLanguageForBrowserLocale(): VoiceLanguageOption | null {
    const locale = typeof navigator !== 'undefined'
      ? navigator.languages?.[0] || navigator.language || ''
      : '';
    const normalized = locale.toLowerCase();
    const code = normalized.startsWith('pt-br')
      ? 'pt-br'
      : normalized.split('-')[0] as VoiceLanguageCode;
    return this.voiceLanguageForCode(code) ?? this.voiceLanguageForCode('en');
  }

  private voiceLanguageForCode(code: VoiceLanguageCode): VoiceLanguageOption | null {
    return this.voiceLanguages().find((language) => language.code === code) ?? null;
  }

  private scrollSelectedVoiceLanguageIntoView(): void {
    const language = this.selectedVoiceLanguage();
    if (!language) {
      return;
    }

    this.scrollVoiceLanguageIntoTrack(
      this.voiceLanguageTrack?.nativeElement,
      '.lang-flag-card',
      this.filteredVoiceLanguages(),
      language,
      () => this.syncVoiceCarouselScrollState(),
    );
    this.scrollVoiceLanguageIntoTrack(
      this.businessVoiceLanguageTrack?.nativeElement,
      '[data-business-language-card="true"]',
      this.businessVoiceLanguages(),
      language,
      () => this.syncBusinessVoiceScrollState(),
    );
  }

  private scrollVoiceLanguageIntoTrack(
    track: HTMLElement | undefined,
    cardSelector: string,
    languages: VoiceLanguageOption[],
    selectedLanguage: VoiceLanguageOption,
    syncScrollState: () => void,
  ): void {
    if (!track) {
      return;
    }

    const index = languages.findIndex((candidate) => this.voiceLanguageMatches(candidate, selectedLanguage));
    if (index < 0) {
      return;
    }

    const cards = Array.from(track.querySelectorAll<HTMLElement>(cardSelector));
    cards[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    window.setTimeout(syncScrollState, 240);
  }

  private voiceLanguageMatches(left: VoiceLanguageOption | null | undefined, right: VoiceLanguageOption | null | undefined): boolean {
    return Boolean(
      left
      && right
      && left.country === right.country
      && left.code === right.code
      && left.language === right.language,
    );
  }

  isSelectedVoiceLanguage(language: VoiceLanguageOption): boolean {
    return this.voiceLanguageMatches(this.selectedVoiceLanguage(), language);
  }

  onVoiceLanguageSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.voiceLanguageSearch.set(input?.value ?? '');
    queueMicrotask(() => {
      const track = this.voiceLanguageTrack?.nativeElement;
      if (track) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      }
      const businessTrack = this.businessVoiceLanguageTrack?.nativeElement;
      if (businessTrack) {
        businessTrack.scrollTo({ left: 0, behavior: 'smooth' });
      }
      this.syncVoiceCarouselScrollState();
      this.syncBusinessVoiceScrollState();
    });
  }

  clearVoiceLanguageSearch(): void {
    this.voiceLanguageSearch.set('');
    queueMicrotask(() => {
      const track = this.voiceLanguageTrack?.nativeElement;
      if (track) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      }
      const businessTrack = this.businessVoiceLanguageTrack?.nativeElement;
      if (businessTrack) {
        businessTrack.scrollTo({ left: 0, behavior: 'smooth' });
      }
      this.syncVoiceCarouselScrollState();
      this.syncBusinessVoiceScrollState();
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

  scrollBusinessVoiceLanguages(direction: -1 | 1): void {
    const track = this.businessVoiceLanguageTrack?.nativeElement;
    if (!track) {
      return;
    }

    const firstCard = track.querySelector<HTMLElement>('[data-business-language-card="true"]');
    const cardWidth = firstCard?.getBoundingClientRect().width ?? 96;
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap || window.getComputedStyle(track).gap || '0') || 0;
    const scrollAmount = Math.max(cardWidth + gap, track.clientWidth * 0.72);

    track.scrollBy({
      left: direction * scrollAmount,
      behavior: 'smooth',
    });

    window.setTimeout(() => this.syncBusinessVoiceScrollState(), 220);
  }

  syncBusinessVoiceScrollState(): void {
    const track = this.businessVoiceLanguageTrack?.nativeElement;
    if (!track) {
      this.businessVoiceAtStart.set(true);
      this.businessVoiceAtEnd.set(false);
      return;
    }

    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
    this.businessVoiceAtStart.set(track.scrollLeft <= 2);
    this.businessVoiceAtEnd.set(track.scrollLeft >= maxScrollLeft - 2);
  }

  selectVoiceLanguage(language: VoiceLanguageOption): void {
    this.voiceLanguageUserSelected = true;
    this.voiceLanguageAutoSelected.set(false);
    this.selectedVoiceLanguage.set(language);
    queueMicrotask(() => this.scrollSelectedVoiceLanguageIntoView());
  }

  async startSelectedVoiceLanguage(): Promise<void> {
    const language = this.selectedVoiceLanguage();
    if (!language) {
      return;
    }
    await this.startVoiceInLanguage(language);
  }

  async startBusinessVoice(): Promise<void> {
    const language = this.businessActiveVoiceLanguage();
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
    this.voiceLanguageUserSelected = true;
    this.voiceLanguageAutoSelected.set(false);
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

    await this.startRealtimeVoice(this.selectedVoiceLanguage() ?? undefined);
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
          participantName: this.currentUserName() || this.currentUserEmail() || 'Living Wiki visitor',
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
        current_living_wiki: cityName ? `Living Wiki, ${cityName}` : 'Living Wiki',
        requested_intro_greeting: greeting,
        link_delivery_instruction: linkDeliveryInstruction,
        city_context_instruction: cityName
          ? `This voice conversation is for the Living Wiki city page for ${cityName}${cityCountry ? `, ${cityCountry}` : ''}. Invite questions about ${cityName}, while still answering broader questions when asked. ${linkDeliveryInstruction}`
          : `This voice conversation is for the current Living Wiki page. ${linkDeliveryInstruction}`,
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
        ?? 'Hi, I’m your Living Wiki voice guide. Ask me anything and I’ll answer out loud.';
    }

    switch (language?.code) {
      case 'ar':
        return `مرحباً بك في Living Wiki، ${city}. كيف يمكنني مساعدتك بشأن ${city} اليوم؟`;
      case 'cs':
        return `Vítejte v Living Wiki, ${city}. Jak vám dnes mohu pomoci s ${city}?`;
      case 'de':
        return `Willkommen bei Living Wiki, ${city}. Wie kann ich dir heute zu ${city} helfen?`;
      case 'es':
        return `Bienvenido a Wiki Viva, ${city}. ¿Cómo puedo ayudarte con ${city} hoy?`;
      case 'fa':
        return `به Living Wiki، ${city} خوش آمدید. امروز درباره ${city} چطور می‌توانم کمک کنم؟`;
      case 'fr':
        return `Bienvenue sur Living Wiki, ${city}. Comment puis-je vous aider avec ${city} aujourd’hui ?`;
      case 'hi':
        return `Living Wiki, ${city} में आपका स्वागत है। आज मैं ${city} के बारे में आपकी कैसे मदद कर सकता हूँ?`;
      case 'hr':
        return `Dobrodošli u Living Wiki, ${city}. Kako vam danas mogu pomoći s ${city}?`;
      case 'ja':
        return `Living Wiki、${city}へようこそ。今日は${city}について、どのようにお手伝いできますか？`;
      case 'ko':
        return `Living Wiki, ${city}에 오신 것을 환영합니다. 오늘 ${city}에 대해 어떻게 도와드릴까요?`;
      case 'nl':
        return `Welkom bij Living Wiki, ${city}. Hoe kan ik u vandaag helpen met ${city}?`;
      case 'no':
        return `Velkommen til Living Wiki, ${city}. Hvordan kan jeg hjelpe deg med ${city} i dag?`;
      case 'pt':
      case 'pt-br':
        return `Bem-vindo ao Living Wiki, ${city}. Como posso ajudar com ${city} hoje?`;
      case 'ru':
        return `Добро пожаловать в Living Wiki, ${city}. Чем я могу помочь вам сегодня по ${city}?`;
      case 'sv':
        return `Välkommen till Living Wiki, ${city}. Hur kan jag hjälpa dig med ${city} idag?`;
      case 'tr':
        return `Living Wiki, ${city} sayfasına hoş geldiniz. Bugün ${city} hakkında size nasıl yardımcı olabilirim?`;
      case 'zh':
        return `欢迎来到 Living Wiki，${city}。今天我可以怎样帮你了解 ${city}？`;
      case 'en':
      default:
        return `Welcome to Living Wiki, ${city}. How can I help?`;
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
      `The current Living Wiki city context is ${this.currentWikiName() || 'the selected city wiki'}.`,
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

  titleizeSlug(value: string): string {
    return value
      .trim()
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
      .join(' ') || 'Business';
  }

  messageLabel(message: ChatMessage): string {
    if (message.role === 'user') {
      return this.uiText('you');
    }
    return message.answerMode === 'internet' ? this.uiText('internet') : this.uiText('myLivingWiki');
  }

  assistantMessageName(): string {
    return this.currentWikiGuide()?.name?.trim() || this.uiText('myLivingWiki');
  }

  assistantMessageSubtitle(message: ChatMessage): string {
    const guideLabel = this.currentWikiGuide()?.label?.trim();
    return guideLabel ? this.localizedGuideLabel(guideLabel) : this.messageLabel(message);
  }

  assistantAvatarUrl(): string {
    return this.currentWikiGuide()?.image_url?.trim() || '/assets/image/livingwiki.png';
  }

  assistantAvatarAlt(): string {
    const name = this.assistantMessageName();
    return name === this.uiText('myLivingWiki') ? this.uiText('myLivingWiki') : `${name} ${this.uiText('guideAlt')}`;
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
        question: question || 'Living Wiki question',
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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;

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
