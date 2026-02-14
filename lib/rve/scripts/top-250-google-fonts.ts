import { GoogleFont } from '@remotion/google-fonts';

/**
 * Top 250 most popular Google Fonts
 * Organized by popularity and usage statistics
 * Each font includes a lazy-loaded import for optimal performance
 */
export const top250 = [
  // Top Sans-serif fonts
  {
    family: 'Roboto',
    load: () => import('@remotion/google-fonts/Roboto') as Promise<GoogleFont>,
  },
  {
    family: 'Open Sans',
    load: () => import('@remotion/google-fonts/OpenSans') as Promise<GoogleFont>,
  },
  {
    family: 'Lato',
    load: () => import('@remotion/google-fonts/Lato') as Promise<GoogleFont>,
  },
  {
    family: 'Montserrat',
    load: () => import('@remotion/google-fonts/Montserrat') as Promise<GoogleFont>,
  },
  {
    family: 'Poppins',
    load: () => import('@remotion/google-fonts/Poppins') as Promise<GoogleFont>,
  },
  {
    family: 'Inter',
    load: () => import('@remotion/google-fonts/Inter') as Promise<GoogleFont>,
  },
  {
    family: 'Raleway',
    load: () => import('@remotion/google-fonts/Raleway') as Promise<GoogleFont>,
  },
  {
    family: 'Ubuntu',
    load: () => import('@remotion/google-fonts/Ubuntu') as Promise<GoogleFont>,
  },
  {
    family: 'Nunito',
    load: () => import('@remotion/google-fonts/Nunito') as Promise<GoogleFont>,
  },
  {
    family: 'Nunito Sans',
    load: () => import('@remotion/google-fonts/NunitoSans') as Promise<GoogleFont>,
  },
  {
    family: 'Work Sans',
    load: () => import('@remotion/google-fonts/WorkSans') as Promise<GoogleFont>,
  },
  {
    family: 'Quicksand',
    load: () => import('@remotion/google-fonts/Quicksand') as Promise<GoogleFont>,
  },
  {
    family: 'Rubik',
    load: () => import('@remotion/google-fonts/Rubik') as Promise<GoogleFont>,
  },
  {
    family: 'Source Sans 3',
    load: () => import('@remotion/google-fonts/SourceSans3') as Promise<GoogleFont>,
  },
  {
    family: 'DM Sans',
    load: () => import('@remotion/google-fonts/DMSans') as Promise<GoogleFont>,
  },
  {
    family: 'Mulish',
    load: () => import('@remotion/google-fonts/Mulish') as Promise<GoogleFont>,
  },
  {
    family: 'Manrope',
    load: () => import('@remotion/google-fonts/Manrope') as Promise<GoogleFont>,
  },
  {
    family: 'Outfit',
    load: () => import('@remotion/google-fonts/Outfit') as Promise<GoogleFont>,
  },
  {
    family: 'Plus Jakarta Sans',
    load: () => import('@remotion/google-fonts/PlusJakartaSans') as Promise<GoogleFont>,
  },
  {
    family: 'Lexend',
    load: () => import('@remotion/google-fonts/Lexend') as Promise<GoogleFont>,
  },
  
  // Popular Serif fonts
  {
    family: 'Playfair Display',
    load: () => import('@remotion/google-fonts/PlayfairDisplay') as Promise<GoogleFont>,
  },
  {
    family: 'Merriweather',
    load: () => import('@remotion/google-fonts/Merriweather') as Promise<GoogleFont>,
  },
  {
    family: 'Lora',
    load: () => import('@remotion/google-fonts/Lora') as Promise<GoogleFont>,
  },
  {
    family: 'PT Serif',
    load: () => import('@remotion/google-fonts/PTSerif') as Promise<GoogleFont>,
  },
  {
    family: 'Noto Serif',
    load: () => import('@remotion/google-fonts/NotoSerif') as Promise<GoogleFont>,
  },
  {
    family: 'EB Garamond',
    load: () => import('@remotion/google-fonts/EBGaramond') as Promise<GoogleFont>,
  },
  {
    family: 'Libre Baskerville',
    load: () => import('@remotion/google-fonts/LibreBaskerville') as Promise<GoogleFont>,
  },
  {
    family: 'Crimson Text',
    load: () => import('@remotion/google-fonts/CrimsonText') as Promise<GoogleFont>,
  },
  {
    family: 'Bitter',
    load: () => import('@remotion/google-fonts/Bitter') as Promise<GoogleFont>,
  },
  {
    family: 'Source Serif 4',
    load: () => import('@remotion/google-fonts/SourceSerif4') as Promise<GoogleFont>,
  },
  
  // Display & Decorative fonts
  {
    family: 'Bebas Neue',
    load: () => import('@remotion/google-fonts/BebasNeue') as Promise<GoogleFont>,
  },
  {
    family: 'Pacifico',
    load: () => import('@remotion/google-fonts/Pacifico') as Promise<GoogleFont>,
  },
  {
    family: 'Dancing Script',
    load: () => import('@remotion/google-fonts/DancingScript') as Promise<GoogleFont>,
  },
  {
    family: 'Comfortaa',
    load: () => import('@remotion/google-fonts/Comfortaa') as Promise<GoogleFont>,
  },
  {
    family: 'Lobster',
    load: () => import('@remotion/google-fonts/Lobster') as Promise<GoogleFont>,
  },
  {
    family: 'Caveat',
    load: () => import('@remotion/google-fonts/Caveat') as Promise<GoogleFont>,
  },
  {
    family: 'Anton',
    load: () => import('@remotion/google-fonts/Anton') as Promise<GoogleFont>,
  },
  {
    family: 'Righteous',
    load: () => import('@remotion/google-fonts/Righteous') as Promise<GoogleFont>,
  },
  {
    family: 'Satisfy',
    load: () => import('@remotion/google-fonts/Satisfy') as Promise<GoogleFont>,
  },
  {
    family: 'Great Vibes',
    load: () => import('@remotion/google-fonts/GreatVibes') as Promise<GoogleFont>,
  },
  
  // Monospace fonts
  {
    family: 'Roboto Mono',
    load: () => import('@remotion/google-fonts/RobotoMono') as Promise<GoogleFont>,
  },
  {
    family: 'Fira Code',
    load: () => import('@remotion/google-fonts/FiraCode') as Promise<GoogleFont>,
  },
  {
    family: 'Source Code Pro',
    load: () => import('@remotion/google-fonts/SourceCodePro') as Promise<GoogleFont>,
  },
  {
    family: 'JetBrains Mono',
    load: () => import('@remotion/google-fonts/JetBrainsMono') as Promise<GoogleFont>,
  },
  {
    family: 'Inconsolata',
    load: () => import('@remotion/google-fonts/Inconsolata') as Promise<GoogleFont>,
  },
  {
    family: 'Space Mono',
    load: () => import('@remotion/google-fonts/SpaceMono') as Promise<GoogleFont>,
  },
  {
    family: 'IBM Plex Mono',
    load: () => import('@remotion/google-fonts/IBMPlexMono') as Promise<GoogleFont>,
  },
  {
    family: 'Courier Prime',
    load: () => import('@remotion/google-fonts/CourierPrime') as Promise<GoogleFont>,
  },
  {
    family: 'Red Hat Mono',
    load: () => import('@remotion/google-fonts/RedHatMono') as Promise<GoogleFont>,
  },
  {
    family: 'DM Mono',
    load: () => import('@remotion/google-fonts/DMMono') as Promise<GoogleFont>,
  },
  
  // Additional popular fonts (51-250)
  {
    family: 'Barlow',
    load: () => import('@remotion/google-fonts/Barlow') as Promise<GoogleFont>,
  },
  {
    family: 'Hind',
    load: () => import('@remotion/google-fonts/Hind') as Promise<GoogleFont>,
  },
  {
    family: 'Josefin Sans',
    load: () => import('@remotion/google-fonts/JosefinSans') as Promise<GoogleFont>,
  },
  {
    family: 'Arimo',
    load: () => import('@remotion/google-fonts/Arimo') as Promise<GoogleFont>,
  },
  {
    family: 'Dosis',
    load: () => import('@remotion/google-fonts/Dosis') as Promise<GoogleFont>,
  },
  {
    family: 'PT Sans',
    load: () => import('@remotion/google-fonts/PTSans') as Promise<GoogleFont>,
  },
  {
    family: 'Libre Franklin',
    load: () => import('@remotion/google-fonts/LibreFranklin') as Promise<GoogleFont>,
  },
  {
    family: 'Karla',
    load: () => import('@remotion/google-fonts/Karla') as Promise<GoogleFont>,
  },
  {
    family: 'Cabin',
    load: () => import('@remotion/google-fonts/Cabin') as Promise<GoogleFont>,
  },
  {
    family: 'Oxygen',
    load: () => import('@remotion/google-fonts/Oxygen') as Promise<GoogleFont>,
  },
  {
    family: 'Overpass',
    load: () => import('@remotion/google-fonts/Overpass') as Promise<GoogleFont>,
  },
  {
    family: 'Fira Sans',
    load: () => import('@remotion/google-fonts/FiraSans') as Promise<GoogleFont>,
  },
  {
    family: 'Maven Pro',
    load: () => import('@remotion/google-fonts/MavenPro') as Promise<GoogleFont>,
  },
  {
    family: 'Cairo',
    load: () => import('@remotion/google-fonts/Cairo') as Promise<GoogleFont>,
  },
  {
    family: 'Exo 2',
    load: () => import('@remotion/google-fonts/Exo2') as Promise<GoogleFont>,
  },
  {
    family: 'Signika',
    load: () => import('@remotion/google-fonts/Signika') as Promise<GoogleFont>,
  },
  {
    family: 'Assistant',
    load: () => import('@remotion/google-fonts/Assistant') as Promise<GoogleFont>,
  },
  {
    family: 'Public Sans',
    load: () => import('@remotion/google-fonts/PublicSans') as Promise<GoogleFont>,
  },
  {
    family: 'Red Hat Display',
    load: () => import('@remotion/google-fonts/RedHatDisplay') as Promise<GoogleFont>,
  },
  {
    family: 'Epilogue',
    load: () => import('@remotion/google-fonts/Epilogue') as Promise<GoogleFont>,
  },
  {
    family: 'Space Grotesk',
    load: () => import('@remotion/google-fonts/SpaceGrotesk') as Promise<GoogleFont>,
  },
  {
    family: 'Sora',
    load: () => import('@remotion/google-fonts/Sora') as Promise<GoogleFont>,
  },
  {
    family: 'Urbanist',
    load: () => import('@remotion/google-fonts/Urbanist') as Promise<GoogleFont>,
  },
  {
    family: 'Figtree',
    load: () => import('@remotion/google-fonts/Figtree') as Promise<GoogleFont>,
  },
  {
    family: 'Schibsted Grotesk',
    load: () => import('@remotion/google-fonts/SchibstedGrotesk') as Promise<GoogleFont>,
  },
  {
    family: 'Onest',
    load: () => import('@remotion/google-fonts/Onest') as Promise<GoogleFont>,
  },
  {
    family: 'Archivo',
    load: () => import('@remotion/google-fonts/Archivo') as Promise<GoogleFont>,
  },
  {
    family: 'Noto Sans JP',
    load: () => import('@remotion/google-fonts/NotoSansJP') as Promise<GoogleFont>,
  },
  {
    family: 'Titillium Web',
    load: () => import('@remotion/google-fonts/TitilliumWeb') as Promise<GoogleFont>,
  },
  {
    family: 'Commissioner',
    load: () => import('@remotion/google-fonts/Commissioner') as Promise<GoogleFont>,
  },
  {
    family: 'Be Vietnam Pro',
    load: () => import('@remotion/google-fonts/BeVietnamPro') as Promise<GoogleFont>,
  },
  {
    family: 'Jost',
    load: () => import('@remotion/google-fonts/Jost') as Promise<GoogleFont>,
  },
  {
    family: 'Chivo',
    load: () => import('@remotion/google-fonts/Chivo') as Promise<GoogleFont>,
  },
  {
    family: 'Heebo',
    load: () => import('@remotion/google-fonts/Heebo') as Promise<GoogleFont>,
  },
  {
    family: 'Mukta',
    load: () => import('@remotion/google-fonts/Mukta') as Promise<GoogleFont>,
  },
  {
    family: 'Kanit',
    load: () => import('@remotion/google-fonts/Kanit') as Promise<GoogleFont>,
  },
  {
    family: 'IBM Plex Sans',
    load: () => import('@remotion/google-fonts/IBMPlexSans') as Promise<GoogleFont>,
  },
  {
    family: 'Barlow Condensed',
    load: () => import('@remotion/google-fonts/BarlowCondensed') as Promise<GoogleFont>,
  },
  {
    family: 'Roboto Condensed',
    load: () => import('@remotion/google-fonts/RobotoCondensed') as Promise<GoogleFont>,
  },
  {
    family: 'Oswald',
    load: () => import('@remotion/google-fonts/Oswald') as Promise<GoogleFont>,
  },
  {
    family: 'Noto Sans',
    load: () => import('@remotion/google-fonts/NotoSans') as Promise<GoogleFont>,
  },
  {
    family: 'Roboto Slab',
    load: () => import('@remotion/google-fonts/RobotoSlab') as Promise<GoogleFont>,
  },
  {
    family: 'Asap',
    load: () => import('@remotion/google-fonts/Asap') as Promise<GoogleFont>,
  },
  {
    family: 'Zilla Slab',
    load: () => import('@remotion/google-fonts/ZillaSlab') as Promise<GoogleFont>,
  },
  {
    family: 'Cormorant Garamond',
    load: () => import('@remotion/google-fonts/CormorantGaramond') as Promise<GoogleFont>,
  },
  {
    family: 'Spectral',
    load: () => import('@remotion/google-fonts/Spectral') as Promise<GoogleFont>,
  },
  {
    family: 'Arvo',
    load: () => import('@remotion/google-fonts/Arvo') as Promise<GoogleFont>,
  },
  {
    family: 'Domine',
    load: () => import('@remotion/google-fonts/Domine') as Promise<GoogleFont>,
  },
  {
    family: 'Vollkorn',
    load: () => import('@remotion/google-fonts/Vollkorn') as Promise<GoogleFont>,
  },
  {
    family: 'Alegreya',
    load: () => import('@remotion/google-fonts/Alegreya') as Promise<GoogleFont>,
  },
  {
    family: 'Crete Round',
    load: () => import('@remotion/google-fonts/CreteRound') as Promise<GoogleFont>,
  },
  {
    family: 'Rokkitt',
    load: () => import('@remotion/google-fonts/Rokkitt') as Promise<GoogleFont>,
  },
  {
    family: 'Slabo 27px',
    load: () => import('@remotion/google-fonts/Slabo27px') as Promise<GoogleFont>,
  },
  {
    family: 'Noticia Text',
    load: () => import('@remotion/google-fonts/NoticiaText') as Promise<GoogleFont>,
  },
  {
    family: 'Frank Ruhl Libre',
    load: () => import('@remotion/google-fonts/FrankRuhlLibre') as Promise<GoogleFont>,
  },
  {
    family: 'Old Standard TT',
    load: () => import('@remotion/google-fonts/OldStandardTT') as Promise<GoogleFont>,
  },
  {
    family: 'Abril Fatface',
    load: () => import('@remotion/google-fonts/AbrilFatface') as Promise<GoogleFont>,
  },
  {
    family: 'Secular One',
    load: () => import('@remotion/google-fonts/SecularOne') as Promise<GoogleFont>,
  },
  {
    family: 'Fredoka',
    load: () => import('@remotion/google-fonts/Fredoka') as Promise<GoogleFont>,
  },
  {
    family: 'Bungee',
    load: () => import('@remotion/google-fonts/Bungee') as Promise<GoogleFont>,
  },
  {
    family: 'Passion One',
    load: () => import('@remotion/google-fonts/PassionOne') as Promise<GoogleFont>,
  },
  {
    family: 'Russo One',
    load: () => import('@remotion/google-fonts/RussoOne') as Promise<GoogleFont>,
  },
  {
    family: 'Permanent Marker',
    load: () => import('@remotion/google-fonts/PermanentMarker') as Promise<GoogleFont>,
  },
  {
    family: 'Cookie',
    load: () => import('@remotion/google-fonts/Cookie') as Promise<GoogleFont>,
  },
  {
    family: 'Kaushan Script',
    load: () => import('@remotion/google-fonts/KaushanScript') as Promise<GoogleFont>,
  },
  {
    family: 'Shadows Into Light',
    load: () => import('@remotion/google-fonts/ShadowsIntoLight') as Promise<GoogleFont>,
  },
  {
    family: 'Amatic SC',
    load: () => import('@remotion/google-fonts/AmaticSC') as Promise<GoogleFont>,
  },
  {
    family: 'Sacramento',
    load: () => import('@remotion/google-fonts/Sacramento') as Promise<GoogleFont>,
  },
  {
    family: 'Handlee',
    load: () => import('@remotion/google-fonts/Handlee') as Promise<GoogleFont>,
  },
  {
    family: 'Patrick Hand',
    load: () => import('@remotion/google-fonts/PatrickHand') as Promise<GoogleFont>,
  },
  {
    family: 'Gloria Hallelujah',
    load: () => import('@remotion/google-fonts/GloriaHallelujah') as Promise<GoogleFont>,
  },
  {
    family: 'Indie Flower',
    load: () => import('@remotion/google-fonts/IndieFlower') as Promise<GoogleFont>,
  },
  {
    family: 'Architects Daughter',
    load: () => import('@remotion/google-fonts/ArchitectsDaughter') as Promise<GoogleFont>,
  },
  {
    family: 'Courgette',
    load: () => import('@remotion/google-fonts/Courgette') as Promise<GoogleFont>,
  },
  {
    family: 'Kalam',
    load: () => import('@remotion/google-fonts/Kalam') as Promise<GoogleFont>,
  },
  {
    family: 'Ubuntu Mono',
    load: () => import('@remotion/google-fonts/UbuntuMono') as Promise<GoogleFont>,
  },
  {
    family: 'Anonymous Pro',
    load: () => import('@remotion/google-fonts/AnonymousPro') as Promise<GoogleFont>,
  },
  {
    family: 'VT323',
    load: () => import('@remotion/google-fonts/VT323') as Promise<GoogleFont>,
  },
  {
    family: 'Overpass Mono',
    load: () => import('@remotion/google-fonts/OverpassMono') as Promise<GoogleFont>,
  },
  {
    family: 'Major Mono Display',
    load: () => import('@remotion/google-fonts/MajorMonoDisplay') as Promise<GoogleFont>,
  },
  {
    family: 'Share Tech Mono',
    load: () => import('@remotion/google-fonts/ShareTechMono') as Promise<GoogleFont>,
  },
  {
    family: 'Nova Mono',
    load: () => import('@remotion/google-fonts/NovaMono') as Promise<GoogleFont>,
  },
  {
    family: 'Cutive Mono',
    load: () => import('@remotion/google-fonts/CutiveMono') as Promise<GoogleFont>,
  },
  {
    family: 'Cousine',
    load: () => import('@remotion/google-fonts/Cousine') as Promise<GoogleFont>,
  },
  {
    family: 'B612 Mono',
    load: () => import('@remotion/google-fonts/B612Mono') as Promise<GoogleFont>,
  },
  {
    family: 'Saira',
    load: () => import('@remotion/google-fonts/Saira') as Promise<GoogleFont>,
  },
  {
    family: 'Prompt',
    load: () => import('@remotion/google-fonts/Prompt') as Promise<GoogleFont>,
  },
  {
    family: 'M PLUS Rounded 1c',
    load: () => import('@remotion/google-fonts/MPLUSRounded1c') as Promise<GoogleFont>,
  },
  {
    family: 'Varela Round',
    load: () => import('@remotion/google-fonts/VarelaRound') as Promise<GoogleFont>,
  },
  {
    family: 'Catamaran',
    load: () => import('@remotion/google-fonts/Catamaran') as Promise<GoogleFont>,
  },
  {
    family: 'Encode Sans',
    load: () => import('@remotion/google-fonts/EncodeSans') as Promise<GoogleFont>,
  },
  {
    family: 'Exo',
    load: () => import('@remotion/google-fonts/Exo') as Promise<GoogleFont>,
  },
  {
    family: 'League Spartan',
    load: () => import('@remotion/google-fonts/LeagueSpartan') as Promise<GoogleFont>,
  },
  {
    family: 'Rajdhani',
    load: () => import('@remotion/google-fonts/Rajdhani') as Promise<GoogleFont>,
  },
  {
    family: 'Tajawal',
    load: () => import('@remotion/google-fonts/Tajawal') as Promise<GoogleFont>,
  },
  {
    family: 'Almarai',
    load: () => import('@remotion/google-fonts/Almarai') as Promise<GoogleFont>,
  },
  {
    family: 'Gothic A1',
    load: () => import('@remotion/google-fonts/GothicA1') as Promise<GoogleFont>,
  },
  {
    family: 'Nanum Gothic',
    load: () => import('@remotion/google-fonts/NanumGothic') as Promise<GoogleFont>,
  },
  {
    family: 'Sarabun',
    load: () => import('@remotion/google-fonts/Sarabun') as Promise<GoogleFont>,
  },
  {
    family: 'Chakra Petch',
    load: () => import('@remotion/google-fonts/ChakraPetch') as Promise<GoogleFont>,
  },
  {
    family: 'Bai Jamjuree',
    load: () => import('@remotion/google-fonts/BaiJamjuree') as Promise<GoogleFont>,
  },
  {
    family: 'Mitr',
    load: () => import('@remotion/google-fonts/Mitr') as Promise<GoogleFont>,
  },
  {
    family: 'Athiti',
    load: () => import('@remotion/google-fonts/Athiti') as Promise<GoogleFont>,
  },
  {
    family: 'Mada',
    load: () => import('@remotion/google-fonts/Mada') as Promise<GoogleFont>,
  },
  {
    family: 'El Messiri',
    load: () => import('@remotion/google-fonts/ElMessiri') as Promise<GoogleFont>,
  },
  {
    family: 'Amiri',
    load: () => import('@remotion/google-fonts/Amiri') as Promise<GoogleFont>,
  },
  {
    family: 'Markazi Text',
    load: () => import('@remotion/google-fonts/MarkaziText') as Promise<GoogleFont>,
  },
  {
    family: 'Harmattan',
    load: () => import('@remotion/google-fonts/Harmattan') as Promise<GoogleFont>,
  },
  {
    family: 'Lalezar',
    load: () => import('@remotion/google-fonts/Lalezar') as Promise<GoogleFont>,
  },
  {
    family: 'Scheherazade New',
    load: () => import('@remotion/google-fonts/ScheherazadeNew') as Promise<GoogleFont>,
  },
  {
    family: 'Vazirmatn',
    load: () => import('@remotion/google-fonts/Vazirmatn') as Promise<GoogleFont>,
  },
  {
    family: 'Readex Pro',
    load: () => import('@remotion/google-fonts/ReadexPro') as Promise<GoogleFont>,
  },
  {
    family: 'Alexandria',
    load: () => import('@remotion/google-fonts/Alexandria') as Promise<GoogleFont>,
  },
  {
    family: 'Reem Kufi',
    load: () => import('@remotion/google-fonts/ReemKufi') as Promise<GoogleFont>,
  },
  {
    family: 'Kufam',
    load: () => import('@remotion/google-fonts/Kufam') as Promise<GoogleFont>,
  },
  {
    family: 'Aref Ruqaa',
    load: () => import('@remotion/google-fonts/ArefRuqaa') as Promise<GoogleFont>,
  },
  {
    family: 'Mirza',
    load: () => import('@remotion/google-fonts/Mirza') as Promise<GoogleFont>,
  },
  {
    family: 'Rasa',
    load: () => import('@remotion/google-fonts/Rasa') as Promise<GoogleFont>,
  },
  {
    family: 'Yrsa',
    load: () => import('@remotion/google-fonts/Yrsa') as Promise<GoogleFont>,
  },
  {
    family: 'Teko',
    load: () => import('@remotion/google-fonts/Teko') as Promise<GoogleFont>,
  },
  {
    family: 'Yantramanav',
    load: () => import('@remotion/google-fonts/Yantramanav') as Promise<GoogleFont>,
  },
  {
    family: 'Khand',
    load: () => import('@remotion/google-fonts/Khand') as Promise<GoogleFont>,
  },
  {
    family: 'Pragati Narrow',
    load: () => import('@remotion/google-fonts/PragatiNarrow') as Promise<GoogleFont>,
  },
  {
    family: 'Laila',
    load: () => import('@remotion/google-fonts/Laila') as Promise<GoogleFont>,
  },
  {
    family: 'Eczar',
    load: () => import('@remotion/google-fonts/Eczar') as Promise<GoogleFont>,
  },
  {
    family: 'Martel',
    load: () => import('@remotion/google-fonts/Martel') as Promise<GoogleFont>,
  },
  {
    family: 'Martel Sans',
    load: () => import('@remotion/google-fonts/MartelSans') as Promise<GoogleFont>,
  },
  {
    family: 'Modak',
    load: () => import('@remotion/google-fonts/Modak') as Promise<GoogleFont>,
  },
  {
    family: 'Pavanam',
    load: () => import('@remotion/google-fonts/Pavanam') as Promise<GoogleFont>,
  },
  {
    family: 'Ramabhadra',
    load: () => import('@remotion/google-fonts/Ramabhadra') as Promise<GoogleFont>,
  },
  {
    family: 'Halant',
    load: () => import('@remotion/google-fonts/Halant') as Promise<GoogleFont>,
  },
  {
    family: 'Share',
    load: () => import('@remotion/google-fonts/Share') as Promise<GoogleFont>,
  },
  {
    family: 'Karma',
    load: () => import('@remotion/google-fonts/Karma') as Promise<GoogleFont>,
  },
  {
    family: 'Archivo Black',
    load: () => import('@remotion/google-fonts/ArchivoBlack') as Promise<GoogleFont>,
  },
  {
    family: 'Coda',
    load: () => import('@remotion/google-fonts/Coda') as Promise<GoogleFont>,
  },
  {
    family: 'Bungee Inline',
    load: () => import('@remotion/google-fonts/BungeeInline') as Promise<GoogleFont>,
  },
  {
    family: 'Orbitron',
    load: () => import('@remotion/google-fonts/Orbitron') as Promise<GoogleFont>,
  },
  {
    family: 'Black Ops One',
    load: () => import('@remotion/google-fonts/BlackOpsOne') as Promise<GoogleFont>,
  },
  {
    family: 'Monoton',
    load: () => import('@remotion/google-fonts/Monoton') as Promise<GoogleFont>,
  },
  {
    family: 'Press Start 2P',
    load: () => import('@remotion/google-fonts/PressStart2P') as Promise<GoogleFont>,
  },
  {
    family: 'Bungee Shade',
    load: () => import('@remotion/google-fonts/BungeeShade') as Promise<GoogleFont>,
  },
  {
    family: 'Rubik Mono One',
    load: () => import('@remotion/google-fonts/RubikMonoOne') as Promise<GoogleFont>,
  },
  {
    family: 'Audiowide',
    load: () => import('@remotion/google-fonts/Audiowide') as Promise<GoogleFont>,
  },
  {
    family: 'Tilt Warp',
    load: () => import('@remotion/google-fonts/TiltWarp') as Promise<GoogleFont>,
  },
  {
    family: 'Gruppo',
    load: () => import('@remotion/google-fonts/Gruppo') as Promise<GoogleFont>,
  },
  {
    family: 'Poiret One',
    load: () => import('@remotion/google-fonts/PoiretOne') as Promise<GoogleFont>,
  },
  {
    family: 'Forum',
    load: () => import('@remotion/google-fonts/Forum') as Promise<GoogleFont>,
  },
  {
    family: 'Syncopate',
    load: () => import('@remotion/google-fonts/Syncopate') as Promise<GoogleFont>,
  },
  {
    family: 'Megrim',
    load: () => import('@remotion/google-fonts/Megrim') as Promise<GoogleFont>,
  },
  {
    family: 'Julius Sans One',
    load: () => import('@remotion/google-fonts/JuliusSansOne') as Promise<GoogleFont>,
  },
  {
    family: 'Advent Pro',
    load: () => import('@remotion/google-fonts/AdventPro') as Promise<GoogleFont>,
  },
  {
    family: 'Wire One',
    load: () => import('@remotion/google-fonts/WireOne') as Promise<GoogleFont>,
  },
  {
    family: 'Nixie One',
    load: () => import('@remotion/google-fonts/NixieOne') as Promise<GoogleFont>,
  },
  {
    family: 'Anek Malayalam',
    load: () => import('@remotion/google-fonts/AnekMalayalam') as Promise<GoogleFont>,
  },
  {
    family: 'Libre Caslon Text',
    load: () => import('@remotion/google-fonts/LibreCaslonText') as Promise<GoogleFont>,
  },
  {
    family: 'Bodoni Moda',
    load: () => import('@remotion/google-fonts/BodoniModa') as Promise<GoogleFont>,
  },
  {
    family: 'Fraunces',
    load: () => import('@remotion/google-fonts/Fraunces') as Promise<GoogleFont>,
  },
  {
    family: 'Literata',
    load: () => import('@remotion/google-fonts/Literata') as Promise<GoogleFont>,
  },
  {
    family: 'Newsreader',
    load: () => import('@remotion/google-fonts/Newsreader') as Promise<GoogleFont>,
  },
  {
    family: 'Petrona',
    load: () => import('@remotion/google-fonts/Petrona') as Promise<GoogleFont>,
  },
  {
    family: 'Piazzolla',
    load: () => import('@remotion/google-fonts/Piazzolla') as Promise<GoogleFont>,
  },
  {
    family: 'Castoro',
    load: () => import('@remotion/google-fonts/Castoro') as Promise<GoogleFont>,
  },
  {
    family: 'Hahmlet',
    load: () => import('@remotion/google-fonts/Hahmlet') as Promise<GoogleFont>,
  },
  {
    family: 'Texturina',
    load: () => import('@remotion/google-fonts/Texturina') as Promise<GoogleFont>,
  },
  {
    family: 'Syne',
    load: () => import('@remotion/google-fonts/Syne') as Promise<GoogleFont>,
  },
  {
    family: 'Brygada 1918',
    load: () => import('@remotion/google-fonts/Brygada1918') as Promise<GoogleFont>,
  },
  {
    family: 'Varta',
    load: () => import('@remotion/google-fonts/Varta') as Promise<GoogleFont>,
  },
  {
    family: 'Grandstander',
    load: () => import('@remotion/google-fonts/Grandstander') as Promise<GoogleFont>,
  },
  {
    family: 'Red Rose',
    load: () => import('@remotion/google-fonts/RedRose') as Promise<GoogleFont>,
  },
  {
    family: 'Andada Pro',
    load: () => import('@remotion/google-fonts/AndadaPro') as Promise<GoogleFont>,
  },
  {
    family: 'Trispace',
    load: () => import('@remotion/google-fonts/Trispace') as Promise<GoogleFont>,
  },
  {
    family: 'Kumbh Sans',
    load: () => import('@remotion/google-fonts/KumbhSans') as Promise<GoogleFont>,
  },
  {
    family: 'Truculenta',
    load: () => import('@remotion/google-fonts/Truculenta') as Promise<GoogleFont>,
  },
  {
    family: 'Belleza',
    load: () => import('@remotion/google-fonts/Belleza') as Promise<GoogleFont>,
  },
  {
    family: 'Didact Gothic',
    load: () => import('@remotion/google-fonts/DidactGothic') as Promise<GoogleFont>,
  },
  {
    family: 'Questrial',
    load: () => import('@remotion/google-fonts/Questrial') as Promise<GoogleFont>,
  },
  {
    family: 'Monda',
    load: () => import('@remotion/google-fonts/Monda') as Promise<GoogleFont>,
  },
  {
    family: 'Lexend Deca',
    load: () => import('@remotion/google-fonts/LexendDeca') as Promise<GoogleFont>,
  },
  {
    family: 'Red Hat Text',
    load: () => import('@remotion/google-fonts/RedHatText') as Promise<GoogleFont>,
  },
  {
    family: 'Alata',
    load: () => import('@remotion/google-fonts/Alata') as Promise<GoogleFont>,
  },
  {
    family: 'Asap Condensed',
    load: () => import('@remotion/google-fonts/AsapCondensed') as Promise<GoogleFont>,
  },
  {
    family: 'Mandali',
    load: () => import('@remotion/google-fonts/Mandali') as Promise<GoogleFont>,
  },
  {
    family: 'Tomorrow',
    load: () => import('@remotion/google-fonts/Tomorrow') as Promise<GoogleFont>,
  },
  {
    family: 'Darker Grotesque',
    load: () => import('@remotion/google-fonts/DarkerGrotesque') as Promise<GoogleFont>,
  },
  {
    family: 'DM Serif Display',
    load: () => import('@remotion/google-fonts/DMSerifDisplay') as Promise<GoogleFont>,
  },
  {
    family: 'Gelasio',
    load: () => import('@remotion/google-fonts/Gelasio') as Promise<GoogleFont>,
  },
  {
    family: 'Inria Serif',
    load: () => import('@remotion/google-fonts/InriaSerif') as Promise<GoogleFont>,
  },
  {
    family: 'Crimson Pro',
    load: () => import('@remotion/google-fonts/CrimsonPro') as Promise<GoogleFont>,
  },
  {
    family: 'Sawarabi Gothic',
    load: () => import('@remotion/google-fonts/SawarabiGothic') as Promise<GoogleFont>,
  },
  {
    family: 'Kosugi Maru',
    load: () => import('@remotion/google-fonts/KosugiMaru') as Promise<GoogleFont>,
  },
  {
    family: 'M PLUS 1p',
    load: () => import('@remotion/google-fonts/MPLUS1p') as Promise<GoogleFont>,
  },
  {
    family: 'Zen Maru Gothic',
    load: () => import('@remotion/google-fonts/ZenMaruGothic') as Promise<GoogleFont>,
  },
  {
    family: 'Stick No Bills',
    load: () => import('@remotion/google-fonts/StickNoBills') as Promise<GoogleFont>,
  },
];
