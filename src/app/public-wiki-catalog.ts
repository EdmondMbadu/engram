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
}

export const PUBLIC_WIKI_CATALOG: PublicWikiCatalogItem[] = [
  {
    title: 'Philly',
    subtitle: 'City Atlas',
    description:
      'Public knowledge for Philadelphia research, local context, and connected source material.',
    status: 'live',
    slug: 'philly',
    category: 'Cities & Regions',
    priority: 'high',
    badges: ['evergreen', 'geo'],
    sources:
      'OpenDataPhilly, DVRPC, PWD, PEA, EPA, Census Bureau, SBN, Green Philly, SEPTA',
  },
  {
    title: 'NewWorld Game',
    subtitle: 'Platform Atlas',
    description:
      'A public wiki for NewWorld Game concepts, programs, and reference documents.',
    status: 'live',
    slug: 'newworld-game',
    category: 'Culture & Entertainment',
  },
  {
    title: 'MS Bookmakers',
    subtitle: 'Industry Atlas',
    description:
      'A public wiki for bookmaker knowledge, notes, and curated source material.',
    status: 'live',
    slug: 'ms-bookmakers',
    category: 'Business & Finance',
  },

  // ===== AI & TECHNOLOGY =====
  {
    title: 'The AI Landscape 2026',
    subtitle: 'AI & Tech',
    description:
      'Complete living map of every major AI company, model, funding round, and technical breakthrough — compiled from arXiv, Crunchbase, GitHub, SEC filings, and tech press.',
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'high',
    badges: ['trending', 'ai'],
    sources:
      'arXiv, Crunchbase, GitHub, PitchBook, SEC EDGAR, TechCrunch, The Information',
  },
  {
    title: 'OpenClaw & the Agentic AI Revolution',
    subtitle: 'AI & Tech',
    description:
      'Living Wiki of the OpenClaw phenomenon — 247K GitHub stars, the viral mechanics, the lobster culture, security incidents, and the broader shift to autonomous AI agents.',
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'high',
    badges: ['viral', 'ai'],
    sources:
      'GitHub, Wikipedia, Wired, Fortune, KDnuggets, CoinMarketCap, Medium',
  },
  {
    title: 'LLM Knowledge Bases & the Karpathy Pattern',
    subtitle: 'AI & Tech',
    description:
      'Technical reference wiki covering the Living Wiki architecture — compile-once vs. RAG, implementation patterns, known deployments, and the academic literature.',
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'high',
    badges: ['ai', 'evergreen'],
    sources:
      "Karpathy's publications, arXiv, GitHub repos, Hacker News discussions, AI newsletters",
  },
  {
    title: 'AI Safety & Alignment',
    subtitle: 'AI & Tech',
    description:
      'Living reference on AI safety research — alignment techniques, interpretability, major papers, key researchers, policy proposals, and the safety vs. capabilities debate.',
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'med',
    badges: ['ai', 'evergreen'],
    sources:
      'arXiv, Anthropic research, OpenAI safety publications, MIRI, ARC, government AI safety institutes',
  },
  {
    title: 'The AI Startup Ecosystem',
    subtitle: 'AI & Tech',
    description:
      'Every funded AI startup by vertical — valuations, investors, revenue estimates, competitive landscapes, and founder backgrounds. The living PitchBook of AI.',
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'high',
    badges: ['trending', 'business'],
    sources:
      'Crunchbase, PitchBook, SEC filings, Y Combinator, a16z portfolio data',
  },
  {
    title: 'Foundation Models Compared',
    subtitle: 'AI & Tech',
    description:
      'Living benchmark comparison of GPT-4.5, Claude 4.6, Gemini 2.5, DeepSeek, Llama 4, Mistral, and emerging models — capabilities, pricing, benchmarks, use cases.',
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'med',
    badges: ['ai', 'trending'],
    sources:
      'Model documentation, LMSYS Chatbot Arena, public benchmarks, API pricing pages',
  },

  // ===== CLIMATE & SUSTAINABILITY =====
  {
    title: 'Living Wiki: Philly (Flagship)',
    subtitle: 'Climate & Sustainability',
    description:
      "The Delaware Valley's living institutional memory — 60+ sources of sustainability, economic, environmental justice, and green infrastructure data for the nine-county region.",
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'high',
    badges: ['evergreen', 'geo'],
    sources:
      'OpenDataPhilly, DVRPC, PWD, PEA, EPA, Census Bureau, SBN, Green Philly, SEPTA',
  },
  {
    title: 'Global Climate Action Tracker',
    subtitle: 'Climate & Sustainability',
    description:
      "Living Wiki of every country's climate commitments, actual emissions, NDC progress, and policy implementations — the COP process made navigable.",
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'high',
    badges: ['trending', 'evergreen'],
    sources:
      'UNFCCC, Climate Action Tracker, Our World in Data, World Bank Climate, IPCC reports, national NDCs',
  },
  {
    title: 'ESG Reporting & Compliance',
    subtitle: 'Climate & Sustainability',
    description:
      'Living reference for corporate ESG — CSRD requirements, SEC climate rules, California SB 253/261, ISSB standards, GRI, SASB, and the evolving compliance landscape.',
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'high',
    badges: ['business', 'trending'],
    sources:
      'SEC, EU CSRD text, California legislature, GRI standards, SASB, ISSB, Big Four guidance',
  },
  {
    title: 'Renewable Energy Atlas',
    subtitle: 'Climate & Sustainability',
    description:
      'Solar, wind, geothermal, and battery storage installations globally — capacity, growth rates, policy incentives, and cost curves compiled from public energy data.',
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'med',
    badges: ['evergreen', 'geo'],
    sources:
      'EIA, IRENA, IEA, DOE, state PUC filings, NREL, BloombergNEF (public data)',
  },
  {
    title: 'Environmental Justice Atlas',
    subtitle: 'Climate & Sustainability',
    description:
      'Mapping environmental injustice — EPA EJScreen data, pollution burden, health disparities, frontline communities, and the intersection of race, poverty, and environmental harm.',
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'med',
    badges: ['trending', 'geo'],
    sources:
      'EPA EJScreen, CDC Environmental Health, Census ACS, state DEQ data, academic research',
  },
  {
    title: 'Urban Green Infrastructure',
    subtitle: 'Climate & Sustainability',
    description:
      "Green roofs, rain gardens, permeable pavement, urban forests, and stormwater management across U.S. cities — what works, what doesn't, and why.",
    status: 'coming-soon',
    category: 'Climate & Sustainability',
    priority: 'med',
    badges: ['evergreen', 'geo'],
    sources:
      'EPA Green Infrastructure, PWD Green City Clean Waters, American Rivers, Trust for Public Land',
  },

  // ===== CULTURE & ENTERTAINMENT =====
  {
    title: '2026 FIFA World Cup',
    subtitle: 'Culture & Entertainment',
    description:
      'Every team, player, match, group, venue, and storyline for the 2026 World Cup in the US, Canada, and Mexico — the biggest sporting event of the year.',
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'high',
    badges: ['trending', 'viral'],
    sources:
      'FIFA.com, Wikipedia, ESPN, BBC Sport, official team federations',
  },
  {
    title: 'The Streaming Wars 2026',
    subtitle: 'Culture & Entertainment',
    description:
      'Every major streaming platform — content libraries, subscriber counts, pricing, original productions, and the business models behind Netflix, Disney+, Max, Apple TV+, and newcomers.',
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'med',
    badges: ['trending', 'business'],
    sources:
      'SEC filings, press releases, Nielsen data (public), trade press (Variety, Deadline, Hollywood Reporter)',
  },
  {
    title: 'The Marvel & DC Cinematic Universe',
    subtitle: 'Culture & Entertainment',
    description:
      'Complete living timeline of every MCU and DCU film, show, character, and interconnection — the most complex fictional narrative ever created, mapped as a Living Wiki.',
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'high',
    badges: ['viral', 'evergreen'],
    sources:
      'Wikipedia, Marvel.com, DC.com, Box Office Mojo, Rotten Tomatoes, fan wikis (transformed)',
  },
  {
    title: 'Taylor Swift: The Living Discography',
    subtitle: 'Culture & Entertainment',
    description:
      'Every album, song, tour, cultural moment, and business decision — compiled from public sources into the definitive Taylor Swift knowledge base.',
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'med',
    badges: ['viral', 'trending'],
    sources:
      'Wikipedia, Billboard, Spotify public data, concert databases, press interviews, SEC filings (Eras Tour economics)',
  },
  {
    title: 'The Podcast Universe',
    subtitle: 'Culture & Entertainment',
    description:
      'Top 500 podcasts mapped by genre, audience, ad rates, and influence — with the business model of podcasting analyzed through public data.',
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'low',
    badges: ['business', 'evergreen'],
    sources:
      'Apple Podcasts charts, Spotify data, Podtrac, Edison Research, IAB data',
  },
  {
    title: 'Video Game Industry Atlas',
    subtitle: 'Culture & Entertainment',
    description:
      'Every major game studio, franchise, release, and business metric — from indie to AAA, console to mobile, mapped as a living knowledge base.',
    status: 'coming-soon',
    category: 'Culture & Entertainment',
    priority: 'med',
    badges: ['trending', 'business'],
    sources:
      'Steam, VGChartz, Metacritic, SEC filings, press releases, NPD/Circana public data',
  },

  // ===== SCIENCE & HEALTH =====
  {
    title: 'The Space Exploration Wiki',
    subtitle: 'Science & Health',
    description:
      'Every active space mission, launch manifest, satellite constellation, and planetary science program — from NASA to SpaceX to ISRO to ESA.',
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'med',
    badges: ['trending', 'evergreen'],
    sources:
      'NASA, ESA, ISRO, SpaceX manifests, launch databases, arXiv astrophysics',
  },
  {
    title: 'The Human Body: A Living Medical Reference',
    subtitle: 'Science & Health',
    description:
      'Major body systems, common conditions, treatments, and prevention — compiled from NIH, WHO, and peer-reviewed medical literature for general audiences.',
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'med',
    badges: ['evergreen'],
    sources:
      'NIH, WHO, PubMed (abstracts), CDC, Mayo Clinic (public), WebMD (public)',
  },
  {
    title: 'The Nutrition & Diet Science Wiki',
    subtitle: 'Science & Health',
    description:
      'Evidence-based nutrition — what the research actually says about diets, supplements, macronutrients, and food science, stripped of marketing hype.',
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'med',
    badges: ['trending', 'evergreen'],
    sources:
      'USDA FoodData Central, NIH ODS, PubMed nutrition research, WHO dietary guidelines',
  },
  {
    title: 'The Mental Health Knowledge Base',
    subtitle: 'Science & Health',
    description:
      'Conditions, therapies, medications, crisis resources, and the science of mental health — compiled from clinical literature for accessible understanding.',
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'med',
    badges: ['trending', 'evergreen'],
    sources:
      'NIMH, APA, WHO, PubMed psychiatry, SAMHSA, crisis resource databases',
  },
  {
    title: 'Pandemic Preparedness & Response',
    subtitle: 'Science & Health',
    description:
      "Lessons from COVID-19, bird flu surveillance, mpox tracking, and the global health security architecture — what we learned and what we haven't fixed.",
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'low',
    badges: ['evergreen'],
    sources:
      'WHO, CDC, Johns Hopkins CSSE (archived), Our World in Data, Lancet/NEJM public articles',
  },

  // ===== BUSINESS & FINANCE =====
  {
    title: 'The Fortune 500 Living Directory',
    subtitle: 'Business & Finance',
    description:
      'Every Fortune 500 company — revenue, leadership, strategy, ESG commitments, recent news, and competitive positioning, compiled from public filings.',
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'high',
    badges: ['business', 'evergreen'],
    sources:
      'SEC EDGAR, Fortune, annual reports, proxy statements, press releases',
  },
  {
    title: 'Venture Capital & Startup Funding',
    subtitle: 'Business & Finance',
    description:
      'VC firms, fund sizes, portfolio companies, investment theses, and the funding landscape — a living Crunchbase alternative compiled from public data.',
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'med',
    badges: ['trending', 'business'],
    sources:
      'Crunchbase (public data), SEC Form D filings, press releases, PitchBook (public summaries)',
  },
  {
    title: 'Cryptocurrency & DeFi Atlas',
    subtitle: 'Business & Finance',
    description:
      'Major protocols, tokens, exchanges, regulatory actions, and the evolving crypto landscape — objective, data-driven, continuously updated.',
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'med',
    badges: ['trending', 'viral'],
    sources:
      'CoinGecko, CoinMarketCap, DeFi Llama, SEC enforcement actions, on-chain data (public)',
  },
  {
    title: 'The Real Estate Market Wiki',
    subtitle: 'Business & Finance',
    description:
      'Housing markets across major U.S. metros — prices, inventory, mortgage rates, construction activity, and affordability metrics from public data.',
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'med',
    badges: ['trending', 'geo'],
    sources:
      'Census Bureau, FHFA, Freddie Mac, Zillow Research (public), NAR (public data), Fed FRED',
  },
  {
    title: 'The Tariff & Trade War Tracker',
    subtitle: 'Business & Finance',
    description:
      "Living Wiki of every tariff, trade restriction, and retaliatory measure in the current global trade environment — what's taxed, who's affected, and what it costs.",
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'high',
    badges: ['trending', 'business'],
    sources:
      'USTR, WTO, CBP, Federal Register, trade press, Congressional Research Service',
  },

  // ===== POLITICS & SOCIETY =====
  {
    title: 'The 2026 U.S. Midterm Elections',
    subtitle: 'Politics & Society',
    description:
      'Every Senate, House, and Governor race — candidates, polling, fundraising, issues, and district-level data compiled from public election sources.',
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'high',
    badges: ['trending', 'viral'],
    sources:
      'FEC, Cook Political Report (public ratings), 538 (public), state election boards, OpenSecrets',
  },
  {
    title: 'Pope Leo XIV & the Modern Catholic Church',
    subtitle: 'Politics & Society',
    description:
      'The new Pope, his papacy, Vatican reforms, and the global Catholic Church — compiled from Vatican sources, news coverage, and church records.',
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'med',
    badges: ['trending'],
    sources:
      'Vatican News, Catholic News Agency, AP/Reuters coverage, historical church records',
  },
  {
    title: 'The Immigration & Border Policy Wiki',
    subtitle: 'Politics & Society',
    description:
      'Current U.S. immigration policy, border data, visa categories, asylum process, and the policy debate — facts and data, not opinion.',
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'med',
    badges: ['trending'],
    sources:
      'CBP, USCIS, DHS, Census Bureau, CRS reports, court filings (PACER)',
  },
  {
    title: 'Gun Violence Data & Policy',
    subtitle: 'Politics & Society',
    description:
      'Mass shootings, firearms statistics, state-by-state gun laws, and the policy landscape — compiled from public safety and legislative data.',
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'low',
    badges: ['evergreen'],
    sources: 'FBI UCR, CDC WONDER, Gun Violence Archive, state legislatures, ATF data',
  },
  {
    title: 'The Ukraine-Russia Conflict',
    subtitle: 'Politics & Society',
    description:
      'Timeline, territorial changes, sanctions, humanitarian impact, and diplomatic efforts — compiled from international sources and open-source intelligence.',
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'med',
    badges: ['trending'],
    sources:
      'UN OCHA, ISW, OSINT community (public), UNHCR, World Bank, EU sanctions registry',
  },

  // ===== CITIES & REGIONS =====
  {
    title: 'Living Wiki: Boston',
    subtitle: 'Cities & Regions',
    description:
      "Boston's sustainability, innovation, and civic data — universities, transit, climate resilience, healthcare, and the innovation economy.",
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'high',
    badges: ['geo', 'business'],
    sources:
      'Boston Open Data, MBTA, Mass.gov, EPA, Census, Harvard/MIT public research',
  },
  {
    title: 'Living Wiki: Portland',
    subtitle: 'Cities & Regions',
    description:
      "Portland's sustainability ecosystem — urban planning, transit, climate action, food systems, and the green economy of the Pacific Northwest.",
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'med',
    badges: ['geo', 'evergreen'],
    sources:
      'Portland Open Data, TriMet, Oregon DEQ, Metro regional government',
  },
  {
    title: 'Living Wiki: Austin',
    subtitle: 'Cities & Regions',
    description:
      "Austin's tech ecosystem, energy transition, growth management, and sustainability challenges — from ERCOT grid data to open city records.",
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'med',
    badges: ['geo', 'trending'],
    sources: 'Austin Open Data, ERCOT, Texas PUC, Census, Austin Energy',
  },
  {
    title: 'Living Wiki: San Francisco',
    subtitle: 'Cities & Regions',
    description:
      "SF's tech ecosystem, housing crisis, transit, climate policy, and civic innovation — compiled from one of the world's best open data programs.",
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'med',
    badges: ['geo', 'ai'],
    sources: 'DataSF, SFMTA, SFPUC, Bay Area Census, California state data',
  },
  {
    title: 'Living Wiki: New York City',
    subtitle: 'Cities & Regions',
    description:
      "NYC's sustainability infrastructure, transit, climate resilience, and green economy — the largest open data program in the world, compiled.",
    status: 'coming-soon',
    category: 'Cities & Regions',
    priority: 'med',
    badges: ['geo', 'trending'],
    sources: 'NYC Open Data (2,700+ datasets), MTA, NYC DEP, PlaNYC, Census',
  },

  // ===== EDUCATION & REFERENCE =====
  {
    title: "The World's Universities Ranked",
    subtitle: 'Education & Reference',
    description:
      'Global universities — rankings, research output, notable alumni, endowments, and program strengths compiled from public academic data.',
    status: 'coming-soon',
    category: 'Education & Reference',
    priority: 'med',
    badges: ['evergreen', 'trending'],
    sources:
      'IPEDS, QS (public data), THE (public data), NCES, university websites, NSF HERD',
  },
  {
    title: 'The History of the Internet',
    subtitle: 'Education & Reference',
    description:
      'From ARPANET to AI agents — the complete living history of the internet, its protocols, its companies, and its cultural impact.',
    status: 'coming-soon',
    category: 'Education & Reference',
    priority: 'low',
    badges: ['evergreen', 'ai'],
    sources:
      'Internet Archive, RFC documents, W3C, Wikipedia (as source), tech history archives',
  },
  {
    title: 'The Open Source Software Atlas',
    subtitle: 'Education & Reference',
    description:
      'Major open-source projects, their maintainers, funding models, license types, and community health — the living map of open-source.',
    status: 'coming-soon',
    category: 'Education & Reference',
    priority: 'med',
    badges: ['ai', 'evergreen'],
    sources:
      'GitHub, OpenSSF, Linux Foundation, Apache Foundation, license databases',
  },
  {
    title: 'Nobel Prize Winners & Discoveries',
    subtitle: 'Education & Reference',
    description:
      'Every Nobel Prize in every category — laureates, discoveries, historical context, and the impact of their work, compiled chronologically.',
    status: 'coming-soon',
    category: 'Education & Reference',
    priority: 'low',
    badges: ['evergreen'],
    sources: 'NobelPrize.org, Wikipedia, academic publications',
  },

  // ===== TRENDING FIGURES & WILDCARDS =====
  {
    title: 'Elon Musk: The Complete Timeline',
    subtitle: 'Trending Figures',
    description:
      'Every company, product, controversy, and statement — from PayPal to Tesla to SpaceX to X to xAI to DOGE, compiled from public records and press.',
    status: 'coming-soon',
    category: 'Trending Figures',
    priority: 'high',
    badges: ['viral', 'trending'],
    sources:
      'SEC filings, court records (PACER), press coverage, X.com posts, company announcements',
  },
  {
    title: 'Donald Trump: Policies & Impact',
    subtitle: 'Trending Figures',
    description:
      'Executive orders, policy changes, court challenges, and measurable impacts of the current administration — compiled from Federal Register and government data.',
    status: 'coming-soon',
    category: 'Trending Figures',
    priority: 'high',
    badges: ['trending', 'viral'],
    sources:
      'Federal Register, WhiteHouse.gov, CBO, CRS, court filings, executive orders',
  },
  {
    title: 'The MrBeast Business Empire',
    subtitle: 'Trending Figures',
    description:
      "YouTube's biggest creator — subscriber growth, business ventures (Feastables, Beast Burger), revenue estimates, and the creator economy he represents.",
    status: 'coming-soon',
    category: 'Trending Figures',
    priority: 'med',
    badges: ['viral', 'business'],
    sources:
      'YouTube public data, Social Blade, SEC filings (if applicable), press coverage',
  },
  {
    title: 'The Ozempic & GLP-1 Revolution',
    subtitle: 'Science & Health',
    description:
      'GLP-1 receptor agonists, clinical trial data, off-label use, side effects, market impact, and the pharmaceutical companies behind the weight-loss drug revolution.',
    status: 'coming-soon',
    category: 'Science & Health',
    priority: 'high',
    badges: ['trending', 'viral'],
    sources:
      'FDA, ClinicalTrials.gov, PubMed, SEC filings (Novo Nordisk, Eli Lilly), WHO',
  },
  {
    title: 'The Student Loan & Higher Ed Crisis',
    subtitle: 'Politics & Society',
    description:
      'Federal student loan data, repayment plans, forgiveness programs, default rates, and the economics of higher education in America.',
    status: 'coming-soon',
    category: 'Politics & Society',
    priority: 'med',
    badges: ['trending'],
    sources:
      'Federal Student Aid, NCES, CBO, Department of Education, Census',
  },
  {
    title: 'The Electric Vehicle Market',
    subtitle: 'Business & Finance',
    description:
      'Every EV model, manufacturer, charging network, battery technology, and policy incentive — the complete living map of the EV transition.',
    status: 'coming-soon',
    category: 'Business & Finance',
    priority: 'med',
    badges: ['trending', 'business'],
    sources:
      'DOE AFDC, EPA fuel economy, IEA Global EV Outlook, SEC filings, state incentive databases',
  },
  {
    title: 'The Artificial Superintelligence Debate',
    subtitle: 'AI & Tech',
    description:
      'AGI timelines, capability research, existential risk arguments, policy proposals, and the philosophical questions around superintelligent AI.',
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'med',
    badges: ['ai', 'trending'],
    sources:
      'arXiv, AI safety institute publications, Congressional testimony, think tank reports, FLI',
  },
  {
    title: 'The Data Privacy & Surveillance Atlas',
    subtitle: 'AI & Tech',
    description:
      'GDPR, CCPA, facial recognition bans, data broker industry, government surveillance programs, and the evolving landscape of digital privacy.',
    status: 'coming-soon',
    category: 'AI & Tech',
    priority: 'med',
    badges: ['trending', 'business'],
    sources:
      'State legislatures, GDPR text, FTC enforcement, EFF, ACLU, court filings',
  },
];
