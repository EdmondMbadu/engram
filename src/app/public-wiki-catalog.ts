import type { AtlasItem } from './atlas.models';
import { CITY_ATLAS_TEMPLATES } from './city-atlas-templates';

export type PublicWikiStatus = 'live' | 'coming-soon';
export type PublicWikiPriority = 'high' | 'med' | 'low';
export type PublicWikiBadge =
  | 'trending'
  | 'ai'
  | 'viral'
  | 'evergreen'
  | 'business'
  | 'geo';

export interface PublicWikiCatalogItem {
  title: string;
  subtitle: string;
  description: string;
  status: PublicWikiStatus;
  slug?: string;
  category?: string;
  priority?: PublicWikiPriority;
  badges?: PublicWikiBadge[];
  sources?: string;
  fallbackHeroUrl?: string;
  fallbackLogoUrl?: string;
  link?: string;
  heroUrl?: string | null;
  logoUrl?: string | null;
  coverColor?: string | null;
  countryLabel?: string | null;
  globalRegion?: string | null;
  population?: number | null;
  populationYear?: number | null;
  areaKm2?: number | null;
  populationDensityPerKm2?: number | null;
  timezone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

type PublicWikiPresentation = Pick<
  PublicWikiCatalogItem,
  'subtitle' | 'category' | 'priority' | 'badges' | 'sources' | 'fallbackHeroUrl' | 'fallbackLogoUrl'
> & {
  title?: string;
};

const CITY_PUBLIC_WIKI_PRESENTATION_BY_SLUG = Object.fromEntries(
  CITY_ATLAS_TEMPLATES.map((template) => [
    template.slug,
    {
      title: template.name,
      subtitle: $localize`Cities & Regions`,
      category: 'Cities & Regions',
      priority: template.priority,
      badges: template.badges,
      fallbackHeroUrl: template.heroUrl ?? undefined,
      fallbackLogoUrl: template.logoUrl ?? undefined,
      sources: template.sources,
    } satisfies PublicWikiPresentation,
  ]),
) as Record<string, PublicWikiPresentation>;

const PUBLIC_WIKI_PRESENTATION_BY_SLUG: Record<string, PublicWikiPresentation> = {
  ...CITY_PUBLIC_WIKI_PRESENTATION_BY_SLUG,
  'newworld-game': {
    subtitle: $localize`Platform Atlas`,
    category: 'Culture & Entertainment',
    fallbackHeroUrl: '/assets/public-wikis/newworld-game-hero.jpg',
    fallbackLogoUrl: '/assets/public-wikis/newworld-game-logo.png',
  },
  bookmakers: {
    subtitle: $localize`Industry Atlas`,
    category: 'Business & Finance',
  },
  'ms-bookmakers': {
    subtitle: $localize`Industry Atlas`,
    category: 'Business & Finance',
  },
  'ms-bomakers': {
    subtitle: $localize`Industry Atlas`,
    category: 'Business & Finance',
  },
};

export const COMING_SOON_PUBLIC_WIKIS: PublicWikiCatalogItem[] = [
  {
    title: $localize`The AI Landscape 2026`,
    subtitle: $localize`AI & Tech`,
    description:
      $localize`Complete living map of every major AI company, model, funding round, and technical breakthrough — compiled from arXiv, Crunchbase, GitHub, SEC filings, and tech press.`,
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'high',
    badges: ['trending', 'ai'],
    sources:
      'arXiv, Crunchbase, GitHub, PitchBook, SEC EDGAR, TechCrunch, The Information',
  },
  {
    title: $localize`OpenClaw & the Agentic AI Revolution`,
    subtitle: $localize`AI & Tech`,
    description:
      $localize`LivingWiki of the OpenClaw phenomenon — 247K GitHub stars, the viral mechanics, the lobster culture, security incidents, and the broader shift to autonomous AI agents.`,
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'high',
    badges: ['viral', 'ai'],
    sources:
      'GitHub, Wikipedia, Wired, Fortune, KDnuggets, CoinMarketCap, Medium',
  },
  {
    title: $localize`LLM Knowledge Bases & the Karpathy Pattern`,
    subtitle: $localize`AI & Tech`,
    description:
      $localize`Technical reference wiki covering the LivingWiki architecture — compile-once vs. RAG, implementation patterns, known deployments, and the academic literature.`,
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'high',
    badges: ['ai', 'evergreen'],
    sources:
      "Karpathy's publications, arXiv, GitHub repos, Hacker News discussions, AI newsletters",
  },
  {
    title: $localize`AI Safety & Alignment`,
    subtitle: $localize`AI & Tech`,
    description:
      $localize`Living reference on AI safety research — alignment techniques, interpretability, major papers, key researchers, policy proposals, and the safety vs. capabilities debate.`,
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'med',
    badges: ['ai', 'evergreen'],
    sources:
      'arXiv, Anthropic research, OpenAI safety publications, MIRI, ARC, government AI safety institutes',
  },
  {
    title: $localize`The AI Startup Ecosystem`,
    subtitle: $localize`AI & Tech`,
    description:
      $localize`Every funded AI startup by vertical — valuations, investors, revenue estimates, competitive landscapes, and founder backgrounds. The living PitchBook of AI.`,
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'high',
    badges: ['trending', 'business'],
    sources:
      'Crunchbase, PitchBook, SEC filings, Y Combinator, a16z portfolio data',
  },
  {
    title: $localize`Foundation Models Compared`,
    subtitle: $localize`AI & Tech`,
    description:
      $localize`Living benchmark comparison of GPT-4.5, Claude 4.6, Gemini 2.5, DeepSeek, Llama 4, Mistral, and emerging models — capabilities, pricing, benchmarks, use cases.`,
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'med',
    badges: ['ai', 'trending'],
    sources:
      'Model documentation, LMSYS Chatbot Arena, public benchmarks, API pricing pages',
  },

  // ===== CLIMATE & SUSTAINABILITY =====
  {
    title: $localize`LivingWiki: Philly (Flagship)`,
    slug: 'philly',
    subtitle: $localize`Climate & Sustainability`,
    description:
      $localize`The Delaware Valley's living institutional memory — 60+ sources of sustainability, economic, environmental justice, and green infrastructure data for the nine-county region.`,
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'high',
    badges: ['evergreen', 'geo'],
    sources:
      'OpenDataPhilly, DVRPC, PWD, PEA, EPA, Census Bureau, SBN, Green Philly, SEPTA',
  },
  {
    title: $localize`Global Climate Action Tracker`,
    subtitle: $localize`Climate & Sustainability`,
    description:
      $localize`LivingWiki of every country's climate commitments, actual emissions, NDC progress, and policy implementations — the COP process made navigable.`,
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'high',
    badges: ['trending', 'evergreen'],
    sources:
      'UNFCCC, Climate Action Tracker, Our World in Data, World Bank Climate, IPCC reports, national NDCs',
  },
  {
    title: $localize`ESG Reporting & Compliance`,
    subtitle: $localize`Climate & Sustainability`,
    description:
      $localize`Living reference for corporate ESG — CSRD requirements, SEC climate rules, California SB 253/261, ISSB standards, GRI, SASB, and the evolving compliance landscape.`,
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'high',
    badges: ['business', 'trending'],
    sources:
      'SEC, EU CSRD text, California legislature, GRI standards, SASB, ISSB, Big Four guidance',
  },
  {
    title: $localize`Renewable Energy Atlas`,
    subtitle: $localize`Climate & Sustainability`,
    description:
      $localize`Solar, wind, geothermal, and battery storage installations globally — capacity, growth rates, policy incentives, and cost curves compiled from public energy data.`,
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'med',
    badges: ['evergreen', 'geo'],
    sources:
      'EIA, IRENA, IEA, DOE, state PUC filings, NREL, BloombergNEF (public data)',
  },
  {
    title: $localize`Environmental Justice Atlas`,
    subtitle: $localize`Climate & Sustainability`,
    description:
      $localize`Mapping environmental injustice — EPA EJScreen data, pollution burden, health disparities, frontline communities, and the intersection of race, poverty, and environmental harm.`,
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'med',
    badges: ['trending', 'geo'],
    sources:
      'EPA EJScreen, CDC Environmental Health, Census ACS, state DEQ data, academic research',
  },
  {
    title: $localize`Urban Green Infrastructure`,
    subtitle: $localize`Climate & Sustainability`,
    description:
      $localize`Green roofs, rain gardens, permeable pavement, urban forests, and stormwater management across U.S. cities — what works, what doesn't, and why.`,
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'med',
    badges: ['evergreen', 'geo'],
    sources:
      'EPA Green Infrastructure, PWD Green City Clean Waters, American Rivers, Trust for Public Land',
  },

  // ===== CULTURE & ENTERTAINMENT =====
  {
    title: $localize`2026 FIFA World Cup`,
    subtitle: $localize`Culture & Entertainment`,
    description:
      $localize`Every team, player, match, group, venue, and storyline for the 2026 World Cup in the US, Canada, and Mexico — the biggest sporting event of the year.`,
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'high',
    badges: ['trending', 'viral'],
    sources:
      'FIFA.com, Wikipedia, ESPN, BBC Sport, official team federations',
  },
  {
    title: $localize`The Streaming Wars 2026`,
    subtitle: $localize`Culture & Entertainment`,
    description:
      $localize`Every major streaming platform — content libraries, subscriber counts, pricing, original productions, and the business models behind Netflix, Disney+, Max, Apple TV+, and newcomers.`,
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'med',
    badges: ['trending', 'business'],
    sources:
      'SEC filings, press releases, Nielsen data (public), trade press (Variety, Deadline, Hollywood Reporter)',
  },
  {
    title: $localize`The Marvel & DC Cinematic Universe`,
    subtitle: $localize`Culture & Entertainment`,
    description:
      $localize`Complete living timeline of every MCU and DCU film, show, character, and interconnection — the most complex fictional narrative ever created, mapped as a LivingWiki.`,
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'high',
    badges: ['viral', 'evergreen'],
    sources:
      'Wikipedia, Marvel.com, DC.com, Box Office Mojo, Rotten Tomatoes, fan wikis (transformed)',
  },
  {
    title: $localize`Taylor Swift: The Living Discography`,
    subtitle: $localize`Culture & Entertainment`,
    description:
      $localize`Every album, song, tour, cultural moment, and business decision — compiled from public sources into the definitive Taylor Swift knowledge base.`,
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'med',
    badges: ['viral', 'trending'],
    sources:
      'Wikipedia, Billboard, Spotify public data, concert databases, press interviews, SEC filings (Eras Tour economics)',
  },
  {
    title: $localize`The Podcast Universe`,
    subtitle: $localize`Culture & Entertainment`,
    description:
      $localize`Top 500 podcasts mapped by genre, audience, ad rates, and influence — with the business model of podcasting analyzed through public data.`,
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'low',
    badges: ['business', 'evergreen'],
    sources:
      'Apple Podcasts charts, Spotify data, Podtrac, Edison Research, IAB data',
  },
  {
    title: $localize`Video Game Industry Atlas`,
    subtitle: $localize`Culture & Entertainment`,
    description:
      $localize`Every major game studio, franchise, release, and business metric — from indie to AAA, console to mobile, mapped as a living knowledge base.`,
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'med',
    badges: ['trending', 'business'],
    sources:
      'Steam, VGChartz, Metacritic, SEC filings, press releases, NPD/Circana public data',
  },

  // ===== SCIENCE & HEALTH =====
  {
    title: $localize`The Space Exploration Wiki`,
    subtitle: $localize`Science & Health`,
    description:
      $localize`Every active space mission, launch manifest, satellite constellation, and planetary science program — from NASA to SpaceX to ISRO to ESA.`,
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'med',
    badges: ['trending', 'evergreen'],
    sources:
      'NASA, ESA, ISRO, SpaceX manifests, launch databases, arXiv astrophysics',
  },
  {
    title: $localize`The Human Body: A Living Medical Reference`,
    subtitle: $localize`Science & Health`,
    description:
      $localize`Major body systems, common conditions, treatments, and prevention — compiled from NIH, WHO, and peer-reviewed medical literature for general audiences.`,
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'med',
    badges: ['evergreen'],
    sources:
      'NIH, WHO, PubMed (abstracts), CDC, Mayo Clinic (public), WebMD (public)',
  },
  {
    title: $localize`The Nutrition & Diet Science Wiki`,
    subtitle: $localize`Science & Health`,
    description:
      $localize`Evidence-based nutrition — what the research actually says about diets, supplements, macronutrients, and food science, stripped of marketing hype.`,
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'med',
    badges: ['trending', 'evergreen'],
    sources:
      'USDA FoodData Central, NIH ODS, PubMed nutrition research, WHO dietary guidelines',
  },
  {
    title: $localize`The Mental Health Knowledge Base`,
    subtitle: $localize`Science & Health`,
    description:
      $localize`Conditions, therapies, medications, crisis resources, and the science of mental health — compiled from clinical literature for accessible understanding.`,
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'med',
    badges: ['trending', 'evergreen'],
    sources:
      'NIMH, APA, WHO, PubMed psychiatry, SAMHSA, crisis resource databases',
  },
  {
    title: $localize`Pandemic Preparedness & Response`,
    subtitle: $localize`Science & Health`,
    description:
      $localize`Lessons from COVID-19, bird flu surveillance, mpox tracking, and the global health security architecture — what we learned and what we haven't fixed.`,
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'low',
    badges: ['evergreen'],
    sources:
      'WHO, CDC, Johns Hopkins CSSE (archived), Our World in Data, Lancet/NEJM public articles',
  },

  // ===== BUSINESS & FINANCE =====
  {
    title: $localize`The Fortune 500 Living Directory`,
    subtitle: $localize`Business & Finance`,
    description:
      $localize`Every Fortune 500 company — revenue, leadership, strategy, ESG commitments, recent news, and competitive positioning, compiled from public filings.`,
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'high',
    badges: ['business', 'evergreen'],
    sources:
      'SEC EDGAR, Fortune, annual reports, proxy statements, press releases',
  },
  {
    title: $localize`Venture Capital & Startup Funding`,
    subtitle: $localize`Business & Finance`,
    description:
      $localize`VC firms, fund sizes, portfolio companies, investment theses, and the funding landscape — a living Crunchbase alternative compiled from public data.`,
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'med',
    badges: ['trending', 'business'],
    sources:
      'Crunchbase (public data), SEC Form D filings, press releases, PitchBook (public summaries)',
  },
  {
    title: $localize`Cryptocurrency & DeFi Atlas`,
    subtitle: $localize`Business & Finance`,
    description:
      $localize`Major protocols, tokens, exchanges, regulatory actions, and the evolving crypto landscape — objective, data-driven, continuously updated.`,
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'med',
    badges: ['trending', 'viral'],
    sources:
      'CoinGecko, CoinMarketCap, DeFi Llama, SEC enforcement actions, on-chain data (public)',
  },
  {
    title: $localize`The Real Estate Market Wiki`,
    subtitle: $localize`Business & Finance`,
    description:
      $localize`Housing markets across major U.S. metros — prices, inventory, mortgage rates, construction activity, and affordability metrics from public data.`,
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'med',
    badges: ['trending', 'geo'],
    sources:
      'Census Bureau, FHFA, Freddie Mac, Zillow Research (public), NAR (public data), Fed FRED',
  },
  {
    title: $localize`The Tariff & Trade War Tracker`,
    subtitle: $localize`Business & Finance`,
    description:
      $localize`LivingWiki of every tariff, trade restriction, and retaliatory measure in the current global trade environment — what's taxed, who's affected, and what it costs.`,
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'high',
    badges: ['trending', 'business'],
    sources:
      'USTR, WTO, CBP, Federal Register, trade press, Congressional Research Service',
  },

  // ===== POLITICS & SOCIETY =====
  {
    title: $localize`The 2026 U.S. Midterm Elections`,
    subtitle: $localize`Politics & Society`,
    description:
      $localize`Every Senate, House, and Governor race — candidates, polling, fundraising, issues, and district-level data compiled from public election sources.`,
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'high',
    badges: ['trending', 'viral'],
    sources:
      'FEC, Cook Political Report (public ratings), 538 (public), state election boards, OpenSecrets',
  },
  {
    title: $localize`Pope Leo XIV & the Modern Catholic Church`,
    subtitle: $localize`Politics & Society`,
    description:
      $localize`The new Pope, his papacy, Vatican reforms, and the global Catholic Church — compiled from Vatican sources, news coverage, and church records.`,
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'med',
    badges: ['trending'],
    sources:
      'Vatican News, Catholic News Agency, AP/Reuters coverage, historical church records',
  },
  {
    title: $localize`The Immigration & Border Policy Wiki`,
    subtitle: $localize`Politics & Society`,
    description:
      $localize`Current U.S. immigration policy, border data, visa categories, asylum process, and the policy debate — facts and data, not opinion.`,
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'med',
    badges: ['trending'],
    sources:
      'CBP, USCIS, DHS, Census Bureau, CRS reports, court filings (PACER)',
  },
  {
    title: $localize`Gun Violence Data & Policy`,
    subtitle: $localize`Politics & Society`,
    description:
      $localize`Mass shootings, firearms statistics, state-by-state gun laws, and the policy landscape — compiled from public safety and legislative data.`,
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'low',
    badges: ['evergreen'],
    sources: 'FBI UCR, CDC WONDER, Gun Violence Archive, state legislatures, ATF data',
  },
  {
    title: $localize`The Ukraine-Russia Conflict`,
    subtitle: $localize`Politics & Society`,
    description:
      $localize`Timeline, territorial changes, sanctions, humanitarian impact, and diplomatic efforts — compiled from international sources and open-source intelligence.`,
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'med',
    badges: ['trending'],
    sources:
      'UN OCHA, ISW, OSINT community (public), UNHCR, World Bank, EU sanctions registry',
  },

  // ===== CITIES & REGIONS =====
  {
    title: $localize`LivingWiki: Boston`,
    slug: 'boston',
    subtitle: $localize`Cities & Regions`,
    description:
      $localize`Boston's sustainability, innovation, and civic data — universities, transit, climate resilience, healthcare, and the innovation economy.`,
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'high',
    badges: ['geo', 'business'],
    sources:
      'Boston Open Data, MBTA, Mass.gov, EPA, Census, Harvard/MIT public research',
  },
  {
    title: $localize`LivingWiki: Portland`,
    slug: 'portland',
    subtitle: $localize`Cities & Regions`,
    description:
      $localize`Portland's sustainability ecosystem — urban planning, transit, climate action, food systems, and the green economy of the Pacific Northwest.`,
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'med',
    badges: ['geo', 'evergreen'],
    sources:
      'Portland Open Data, TriMet, Oregon DEQ, Metro regional government',
  },
  {
    title: $localize`LivingWiki: Austin`,
    slug: 'austin',
    subtitle: $localize`Cities & Regions`,
    description:
      $localize`Austin's tech ecosystem, energy transition, growth management, and sustainability challenges — from ERCOT grid data to open city records.`,
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'med',
    badges: ['geo', 'trending'],
    sources: 'Austin Open Data, ERCOT, Texas PUC, Census, Austin Energy',
  },
  {
    title: $localize`LivingWiki: Gainesville`,
    slug: 'gainesville',
    subtitle: $localize`Cities & Regions`,
    description:
      $localize`Gainesville's university city, civic, climate, transit, housing, innovation, health, culture, and North Central Florida public data.`,
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'med',
    badges: ['geo', 'evergreen'],
    sources:
      'City of Gainesville Open Data, Alachua County, RTS, University of Florida, EPA, Census',
  },
  {
    title: $localize`LivingWiki: San Francisco`,
    slug: 'san-francisco',
    subtitle: $localize`Cities & Regions`,
    description:
      $localize`SF's tech ecosystem, housing crisis, transit, climate policy, and civic innovation — compiled from one of the world's best open data programs.`,
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'med',
    badges: ['geo', 'ai'],
    sources: 'DataSF, SFMTA, SFPUC, Bay Area Census, California state data',
  },
  {
    title: $localize`LivingWiki: New York City`,
    slug: 'new-york-city',
    subtitle: $localize`Cities & Regions`,
    description:
      $localize`NYC's sustainability infrastructure, transit, climate resilience, and green economy — the largest open data program in the world, compiled.`,
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'med',
    badges: ['geo', 'trending'],
    sources: 'NYC Open Data (2,700+ datasets), MTA, NYC DEP, PlaNYC, Census',
  },

  // ===== EDUCATION & REFERENCE =====
  {
    title: $localize`The World's Universities Ranked`,
    subtitle: $localize`Education & Reference`,
    description:
      $localize`Global universities — rankings, research output, notable alumni, endowments, and program strengths compiled from public academic data.`,
    status: 'coming-soon',
    category: 'Education & Reference',
    priority: 'med',
    badges: ['evergreen', 'trending'],
    sources:
      'IPEDS, QS (public data), THE (public data), NCES, university websites, NSF HERD',
  },
  {
    title: $localize`The History of the Internet`,
    subtitle: $localize`Education & Reference`,
    description:
      $localize`From ARPANET to AI agents — the complete living history of the internet, its protocols, its companies, and its cultural impact.`,
    status: 'coming-soon',
    category: 'Education & Reference',
    priority: 'low',
    badges: ['evergreen', 'ai'],
    sources:
      'Internet Archive, RFC documents, W3C, Wikipedia (as source), tech history archives',
  },
  {
    title: $localize`The Open Source Software Atlas`,
    subtitle: $localize`Education & Reference`,
    description:
      $localize`Major open-source projects, their maintainers, funding models, license types, and community health — the living map of open-source.`,
    status: 'coming-soon',
    category: 'Education & Reference',
    priority: 'med',
    badges: ['ai', 'evergreen'],
    sources:
      'GitHub, OpenSSF, Linux Foundation, Apache Foundation, license databases',
  },
  {
    title: $localize`Nobel Prize Winners & Discoveries`,
    subtitle: $localize`Education & Reference`,
    description:
      $localize`Every Nobel Prize in every category — laureates, discoveries, historical context, and the impact of their work, compiled chronologically.`,
    status: 'coming-soon',
    category: 'Education & Reference',
    priority: 'low',
    badges: ['evergreen'],
    sources: 'NobelPrize.org, Wikipedia, academic publications',
  },

  // ===== TRENDING FIGURES & WILDCARDS =====
  {
    title: $localize`Elon Musk: The Complete Timeline`,
    subtitle: $localize`Trending Figures`,
    description:
      $localize`Every company, product, controversy, and statement — from PayPal to Tesla to SpaceX to X to xAI to DOGE, compiled from public records and press.`,
    status: 'coming-soon',
    category: 'Trending Figures',
    priority: 'high',
    badges: ['viral', 'trending'],
    sources:
      'SEC filings, court records (PACER), press coverage, X.com posts, company announcements',
  },
  {
    title: $localize`Donald Trump: Policies & Impact`,
    subtitle: $localize`Trending Figures`,
    description:
      $localize`Executive orders, policy changes, court challenges, and measurable impacts of the current administration — compiled from Federal Register and government data.`,
    status: 'coming-soon',
    category: 'Trending Figures',
    priority: 'high',
    badges: ['trending', 'viral'],
    sources:
      'Federal Register, WhiteHouse.gov, CBO, CRS, court filings, executive orders',
  },
  {
    title: $localize`The MrBeast Business Empire`,
    subtitle: $localize`Trending Figures`,
    description:
      $localize`YouTube's biggest creator — subscriber growth, business ventures (Feastables, Beast Burger), revenue estimates, and the creator economy he represents.`,
    status: 'coming-soon',
    category: 'Trending Figures',
    priority: 'med',
    badges: ['viral', 'business'],
    sources:
      'YouTube public data, Social Blade, SEC filings (if applicable), press coverage',
  },
  {
    title: $localize`The Ozempic & GLP-1 Revolution`,
    subtitle: $localize`Science & Health`,
    description:
      $localize`GLP-1 receptor agonists, clinical trial data, off-label use, side effects, market impact, and the pharmaceutical companies behind the weight-loss drug revolution.`,
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'high',
    badges: ['trending', 'viral'],
    sources:
      'FDA, ClinicalTrials.gov, PubMed, SEC filings (Novo Nordisk, Eli Lilly), WHO',
  },
  {
    title: $localize`The Student Loan & Higher Ed Crisis`,
    subtitle: $localize`Politics & Society`,
    description:
      $localize`Federal student loan data, repayment plans, forgiveness programs, default rates, and the economics of higher education in America.`,
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'med',
    badges: ['trending'],
    sources:
      'Federal Student Aid, NCES, CBO, Department of Education, Census',
  },
  {
    title: $localize`The Electric Vehicle Market`,
    subtitle: $localize`Business & Finance`,
    description:
      $localize`Every EV model, manufacturer, charging network, battery technology, and policy incentive — the complete living map of the EV transition.`,
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'med',
    badges: ['trending', 'business'],
    sources:
      'DOE AFDC, EPA fuel economy, IEA Global EV Outlook, SEC filings, state incentive databases',
  },
  {
    title: $localize`The Artificial Superintelligence Debate`,
    subtitle: $localize`AI & Tech`,
    description:
      $localize`AGI timelines, capability research, existential risk arguments, policy proposals, and the philosophical questions around superintelligent AI.`,
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'med',
    badges: ['ai', 'trending'],
    sources:
      'arXiv, AI safety institute publications, Congressional testimony, think tank reports, FLI',
  },
  {
    title: $localize`The Data Privacy & Surveillance Atlas`,
    subtitle: $localize`AI & Tech`,
    description:
      $localize`GDPR, CCPA, facial recognition bans, data broker industry, government surveillance programs, and the evolving landscape of digital privacy.`,
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'med',
    badges: ['trending', 'business'],
    sources:
      'State legislatures, GDPR text, FTC enforcement, EFF, ACLU, court filings',
  },
];

function atlasSortDate(atlas: AtlasItem): number {
  const updated =
    atlas.updated_at instanceof Date
      ? atlas.updated_at.getTime()
      : atlas.updated_at?.toDate?.().getTime() ?? 0;
  if (updated > 0) return updated;
  return atlas.created_at instanceof Date
    ? atlas.created_at.getTime()
    : atlas.created_at?.toDate?.().getTime() ?? 0;
}

function inferPresentation(atlas: AtlasItem): PublicWikiPresentation {
  const slug = atlas.slug.trim().toLowerCase();
  const title = atlas.name.trim().toLowerCase();
  if (PUBLIC_WIKI_PRESENTATION_BY_SLUG[slug]) {
    return PUBLIC_WIKI_PRESENTATION_BY_SLUG[slug];
  }
  if (title.includes('philly')) {
    return PUBLIC_WIKI_PRESENTATION_BY_SLUG['philly'];
  }
  if (title.includes('newworld')) {
    return PUBLIC_WIKI_PRESENTATION_BY_SLUG['newworld-game'];
  }
  if (title.includes('bookmaker')) {
    return PUBLIC_WIKI_PRESENTATION_BY_SLUG['bookmakers'];
  }
  if (atlas.city_config?.enabled) {
    return {
      title: atlas.name?.trim() || undefined,
      subtitle: $localize`Cities & Regions`,
      category: 'Cities & Regions',
      priority: 'med',
      badges: ['geo'],
      fallbackLogoUrl: '/assets/image/living-cities.png',
      sources: 'Internet-grounded city answers. Source bundles can be added later.',
    };
  }
  return {
    subtitle: $localize`Public Atlas`,
    category: 'Public Atlases',
  };
}

export function sortPublicAtlases(atlases: AtlasItem[]): AtlasItem[] {
  return [...atlases].sort((a, b) => {
    const aDate = atlasSortDate(a);
    const bDate = atlasSortDate(b);
    if (aDate !== bDate) return aDate - bDate;
    const aName = a.name.trim().toLowerCase();
    const bName = b.name.trim().toLowerCase();
    return aName.localeCompare(bName);
  });
}

export function buildPublicWikiLiveItem(atlas: AtlasItem): PublicWikiCatalogItem {
  const presentation = inferPresentation(atlas);
  const slug = atlas.slug?.trim() || atlas.id;
  const title = presentation.title ?? (atlas.name?.trim() || `Atlas ${atlas.id.slice(0, 6)}`);
  return {
    title,
    subtitle: presentation.subtitle ?? 'Public Atlas',
    description: atlas.description?.trim() || `Explore ${title} in LivingWiki.`,
    status: 'live',
    slug,
    category: presentation.category ?? 'Public Atlases',
    priority: presentation.priority,
    badges: presentation.badges,
    sources: presentation.sources,
    fallbackHeroUrl: presentation.fallbackHeroUrl,
    fallbackLogoUrl: presentation.fallbackLogoUrl,
    link: `/chat/${slug}`,
    heroUrl: atlas.hero_url ?? presentation.fallbackHeroUrl ?? null,
    logoUrl: atlas.logo_url ?? presentation.fallbackLogoUrl ?? null,
    coverColor: atlas.cover_color ?? null,
    globalRegion: atlas.city_config?.metadata?.global_region ?? null,
    population: atlas.city_config?.metadata?.population ?? null,
    populationYear: atlas.city_config?.metadata?.population_year ?? null,
    areaKm2: atlas.city_config?.metadata?.area_km2 ?? null,
    populationDensityPerKm2: atlas.city_config?.metadata?.population_density_per_km2 ?? null,
    timezone: atlas.city_config?.timezone ?? null,
    latitude: atlas.city_config?.latitude ?? null,
    longitude: atlas.city_config?.longitude ?? null,
  };
}

export function removeCreatedPublicWikiPreviews(
  liveWikis: PublicWikiCatalogItem[],
  previewWikis = COMING_SOON_PUBLIC_WIKIS,
): PublicWikiCatalogItem[] {
  const liveKeys = new Set(
    liveWikis.flatMap((wiki) => [
      wiki.slug?.trim().toLowerCase() || '',
      wiki.title.trim().toLowerCase(),
    ]).filter(Boolean),
  );

  return previewWikis.filter((wiki) => {
    const slug = wiki.slug?.trim().toLowerCase();
    if (slug && liveKeys.has(slug)) {
      return false;
    }
    return !liveKeys.has(wiki.title.trim().toLowerCase());
  });
}
