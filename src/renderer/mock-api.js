// window.api de ejemplo para ver la interfaz sin el proceso principal (navegador o Electron sin preload).
// F9 (o Ctrl+Shift+D) abre un panel de depuracion para simular fases. Desde la consola: __mock.setPhase('ingame').
'use strict';

(function () {
  if (window.api) return;

  // ---------- Datos fijos ----------
  const CH = [[266,'Aatrox','Aatrox'],[103,'Ahri','Ahri'],[84,'Akali','Akali'],[166,'Akshan','Akshan'],[12,'Alistar','Alistar'],[799,'Ambessa','Ambessa'],[32,'Amumu','Amumu'],[34,'Anivia','Anivia'],[1,'Annie','Annie'],[523,'Aphelios','Aphelios'],[22,'Ashe','Ashe'],[136,'Aurelion Sol','AurelionSol'],[893,'Aurora','Aurora'],[268,'Azir','Azir'],[432,'Bardo','Bard'],[200,"Bel'Veth",'Belveth'],[53,'Blitzcrank','Blitzcrank'],[63,'Brand','Brand'],[201,'Braum','Braum'],[233,'Briar','Briar'],[51,'Caitlyn','Caitlyn'],[164,'Camille','Camille'],[69,'Cassiopeia','Cassiopeia'],[31,"Cho'Gath",'Chogath'],[42,'Corki','Corki'],[122,'Darius','Darius'],[131,'Diana','Diana'],[36,'Dr. Mundo','DrMundo'],[119,'Draven','Draven'],[245,'Ekko','Ekko'],[60,'Elise','Elise'],[28,'Evelynn','Evelynn'],[81,'Ezreal','Ezreal'],[9,'Fiddlesticks','Fiddlesticks'],[114,'Fiora','Fiora'],[105,'Fizz','Fizz'],[3,'Galio','Galio'],[41,'Gangplank','Gangplank'],[86,'Garen','Garen'],[150,'Gnar','Gnar'],[79,'Gragas','Gragas'],[104,'Graves','Graves'],[887,'Gwen','Gwen'],[120,'Hecarim','Hecarim'],[74,'Heimerdinger','Heimerdinger'],[910,'Hwei','Hwei'],[420,'Illaoi','Illaoi'],[39,'Irelia','Irelia'],[427,'Ivern','Ivern'],[40,'Janna','Janna'],[59,'Jarvan IV','JarvanIV'],[24,'Jax','Jax'],[126,'Jayce','Jayce'],[202,'Jhin','Jhin'],[222,'Jinx','Jinx'],[145,"Kai'Sa",'Kaisa'],[429,'Kalista','Kalista'],[43,'Karma','Karma'],[30,'Karthus','Karthus'],[38,'Kassadin','Kassadin'],[55,'Katarina','Katarina'],[10,'Kayle','Kayle'],[141,'Kayn','Kayn'],[85,'Kennen','Kennen'],[121,"Kha'Zix",'Khazix'],[203,'Kindred','Kindred'],[240,'Kled','Kled'],[96,"Kog'Maw",'KogMaw'],[897,"K'Sante",'KSante'],[7,'LeBlanc','Leblanc'],[64,'Lee Sin','LeeSin'],[89,'Leona','Leona'],[876,'Lillia','Lillia'],[127,'Lissandra','Lissandra'],[236,'Lucian','Lucian'],[117,'Lulu','Lulu'],[99,'Lux','Lux'],[11,'Maestro Yi','MasterYi'],[54,'Malphite','Malphite'],[90,'Malzahar','Malzahar'],[57,'Maokai','Maokai'],[800,'Mel','Mel'],[902,'Milio','Milio'],[21,'Miss Fortune','MissFortune'],[82,'Mordekaiser','Mordekaiser'],[25,'Morgana','Morgana'],[950,'Naafiri','Naafiri'],[267,'Nami','Nami'],[75,'Nasus','Nasus'],[111,'Nautilus','Nautilus'],[518,'Neeko','Neeko'],[76,'Nidalee','Nidalee'],[895,'Nilah','Nilah'],[56,'Nocturne','Nocturne'],[20,'Nunu y Willump','Nunu'],[2,'Olaf','Olaf'],[61,'Orianna','Orianna'],[516,'Ornn','Ornn'],[80,'Pantheon','Pantheon'],[78,'Poppy','Poppy'],[555,'Pyke','Pyke'],[246,'Qiyana','Qiyana'],[133,'Quinn','Quinn'],[497,'Rakan','Rakan'],[33,'Rammus','Rammus'],[421,"Rek'Sai",'RekSai'],[526,'Rell','Rell'],[888,'Renata Glasc','Renata'],[58,'Renekton','Renekton'],[107,'Rengar','Rengar'],[92,'Riven','Riven'],[68,'Rumble','Rumble'],[13,'Ryze','Ryze'],[360,'Samira','Samira'],[113,'Sejuani','Sejuani'],[235,'Senna','Senna'],[147,'Seraphine','Seraphine'],[875,'Sett','Sett'],[35,'Shaco','Shaco'],[98,'Shen','Shen'],[102,'Shyvana','Shyvana'],[27,'Singed','Singed'],[14,'Sion','Sion'],[15,'Sivir','Sivir'],[72,'Skarner','Skarner'],[901,'Smolder','Smolder'],[37,'Sona','Sona'],[16,'Soraka','Soraka'],[50,'Swain','Swain'],[517,'Sylas','Sylas'],[134,'Syndra','Syndra'],[223,'Tahm Kench','TahmKench'],[163,'Taliyah','Taliyah'],[91,'Talon','Talon'],[44,'Taric','Taric'],[17,'Teemo','Teemo'],[412,'Thresh','Thresh'],[18,'Tristana','Tristana'],[48,'Trundle','Trundle'],[23,'Tryndamere','Tryndamere'],[4,'Twisted Fate','TwistedFate'],[29,'Twitch','Twitch'],[77,'Udyr','Udyr'],[6,'Urgot','Urgot'],[110,'Varus','Varus'],[67,'Vayne','Vayne'],[45,'Veigar','Veigar'],[161,"Vel'Koz",'Velkoz'],[711,'Vex','Vex'],[254,'Vi','Vi'],[234,'Viego','Viego'],[112,'Viktor','Viktor'],[8,'Vladimir','Vladimir'],[106,'Volibear','Volibear'],[19,'Warwick','Warwick'],[62,'Wukong','MonkeyKing'],[498,'Xayah','Xayah'],[101,'Xerath','Xerath'],[5,'Xin Zhao','XinZhao'],[157,'Yasuo','Yasuo'],[777,'Yone','Yone'],[83,'Yorick','Yorick'],[804,'Yunara','Yunara'],[350,'Yuumi','Yuumi'],[154,'Zac','Zac'],[238,'Zed','Zed'],[221,'Zeri','Zeri'],[115,'Ziggs','Ziggs'],[26,'Zilean','Zilean'],[142,'Zoe','Zoe'],[143,'Zyra','Zyra']];

  const ITEMS = { 1101: ['Cachorro de Garra Ígnea', 450], 1102: ['Cría de Caminabrisas', 450], 1103: ['Brote de Brincamontes', 450], 2003: ['Poción de vida', 50], 3340: ['Guardián invisible', 0], 3364: ['Lente del oráculo', 0], 2055: ['Guardián de control', 75], 6653: ['Tormento de Liandry', 3000], 4645: ['Llamasombría', 3200], 3157: ['Reloj de arena de Zhonya', 3250], 3089: ['Sombrero mortal de Rabadon', 3500], 3135: ['Bastón del Vacío', 3000], 3020: ['Botas de hechicero', 1100], 3158: ['Botas jonias de la lucidez', 900], 3142: ['Filo fantasmal de Youmuu', 2800], 6694: ['Rencor de Serylda', 3000], 6698: ['Hidra profana', 2850], 3814: ['Filo de la noche', 3000], 3071: ['Cuchilla negra', 3000], 3036: ['Recuerdos de lord Dominik', 3100], 3031: ['Filo infinito', 3450], 3137: ['Florescencia sepulcral', 3000], 3116: ['Cetro de cristal de Rylai', 2600], 3115: ['Diente de Nashor', 2900], 3047: ['Botas blindadas', 1200], 3111: ['Botas de mercurio', 1250], 3006: ['Grebas de berserker', 1100], 6672: ['Verdugo de krakens', 3000], 3153: ['Hoja del rey arruinado', 3200], 3053: ['Calibrador de Sterak', 3200], 3748: ['Hidra titánica', 3300], 6333: ['Baile de la muerte', 3300], 3026: ['Ángel de la guarda', 3200], 3065: ['Rostro espiritual', 2700], 3075: ['Malla de espinas', 2450], 3068: ['Égida de fuego solar', 2700], 3742: ['Coraza del muerto', 2900], 4401: ['Fuerza de la naturaleza', 2800], 3009: ['Botas de rapidez', 1000], 6610: ['Firmamento desgarrado', 3100], 3161: ['Lanza de Shojin', 3100], 2502: ['Desesperanza eterna', 2800], 6701: ['Oportunidades', 2700], 3179: ['Guja sombría', 2500] };

  const SPELLS = { 21: ['SummonerBarrier', 'Barrera'], 1: ['SummonerBoost', 'Limpiar'], 14: ['SummonerDot', 'Prender'], 3: ['SummonerExhaust', 'Extenuación'], 4: ['SummonerFlash', 'Destello'], 6: ['SummonerHaste', 'Fantasmal'], 7: ['SummonerHeal', 'Curar'], 11: ['SummonerSmite', 'Aplastar'], 12: ['SummonerTeleport', 'Teleportar'] };

  const RUNES = {
    8100: ['Dominación', 'perk-images/Styles/7200_Domination.png'], 8000: ['Precisión', 'perk-images/Styles/7201_Precision.png'],
    8200: ['Brujería', 'perk-images/Styles/7202_Sorcery.png'], 8300: ['Inspiración', 'perk-images/Styles/7203_Whimsy.png'], 8400: ['Valor', 'perk-images/Styles/7204_Resolve.png'],
    8112: ['Electrocutar', 'perk-images/Styles/Domination/Electrocute/Electrocute.png'], 8128: ['Cosecha oscura', 'perk-images/Styles/Domination/DarkHarvest/DarkHarvest.png'],
    9923: ['Lluvia de cuchillas', 'perk-images/Styles/Domination/HailOfBlades/HailOfBlades.png'], 8126: ['Golpe bajo', 'perk-images/Styles/Domination/CheapShot/CheapShot.png'],
    8143: ['Impacto repentino', 'perk-images/Styles/Domination/SuddenImpact/SuddenImpact.png'], 8140: ['Recuerdo macabro', 'perk-images/Styles/Domination/GrislyMementos/GrislyMementos.png'],
    8135: ['Cazador de tesoros', 'perk-images/Styles/Domination/TreasureHunter/TreasureHunter.png'], 8105: ['Cazador incesante', 'perk-images/Styles/Domination/RelentlessHunter/RelentlessHunter.png'],
    8106: ['Cazador definitivo', 'perk-images/Styles/Domination/UltimateHunter/UltimateHunter.png'],
    8010: ['Conquistador', 'perk-images/Styles/Precision/Conqueror/Conqueror.png'], 9111: ['Triunfo', 'perk-images/Styles/Precision/Triumph.png'],
    9104: ['Leyenda: Presteza', 'perk-images/Styles/Precision/LegendAlacrity/LegendAlacrity.png'], 9105: ['Leyenda: Velocidad', 'perk-images/Styles/Precision/LegendHaste/LegendHaste.png'],
    8014: ['Golpe de gracia', 'perk-images/Styles/Precision/CoupDeGrace/CoupDeGrace.png'], 8017: ['Derribado', 'perk-images/Styles/Precision/CutDown/CutDown.png'],
    8009: ['Claridad mental', 'perk-images/Styles/Precision/PresenceOfMind/PresenceOfMind.png'],
    8230: ['Irrupción de fase', 'perk-images/Styles/Sorcery/PhaseRush/PhaseRush.png'], 8275: ['Capa del nimbo', 'perk-images/Styles/Sorcery/NimbusCloak/6361.png'],
    8210: ['Trascendencia', 'perk-images/Styles/Sorcery/Transcendence/Transcendence.png'], 8237: ['Piroláser', 'perk-images/Styles/Sorcery/Scorch/Scorch.png'],
    8232: ['Caminar sobre agua', 'perk-images/Styles/Sorcery/Waterwalking/Waterwalking.png'], 8236: ['Se avecina tormenta', 'perk-images/Styles/Sorcery/GatheringStorm/GatheringStorm.png'],
    8304: ['Calzado mágico', 'perk-images/Styles/Inspiration/MagicalFootwear/MagicalFootwear.png'], 8345: ['Entrega de galletas', 'perk-images/Styles/Inspiration/BiscuitDelivery/BiscuitDelivery.png'],
    8347: ['Perspicacia cósmica', 'perk-images/Styles/Inspiration/CosmicInsight/CosmicInsight.png'],
    5005: ['Velocidad de ataque', null], 5008: ['Fuerza adaptable', null],
    5001: ['Vida escalable', null], 5010: ['Velocidad de movimiento', null],
    5011: ['Vida', null], 5013: ['Tenacidad', null],
  };

  // Todas las runas del parche 16.21 (Data Dragon), con arbol y fila
  const RUNES_FULL = {"5001":["Vida creciente",null],"5002":["Armadura",null],"5003":["Resistencia mágica",null],"5005":["Velocidad de ataque",null],"5007":["Aceleración de habilidades",null],"5008":["Fuerza adaptable",null],"5010":["Velocidad de movimiento",null],"5011":["Vida",null],"5013":["Tenacidad y resistencia a ralentizaciones",null],"8000":["Precisión","perk-images/Styles/7201_Precision.png"],"8005":["Ataque intensificado","perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png",8000,0],"8008":["Compás letal","perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png",8000,0],"8009":["Claridad mental","perk-images/Styles/Precision/PresenceOfMind/PresenceOfMind.png",8000,1],"8010":["Conquistador","perk-images/Styles/Precision/Conqueror/Conqueror.png",8000,0],"8014":["Golpe de gracia","perk-images/Styles/Precision/CoupDeGrace/CoupDeGrace.png",8000,3],"8017":["Derribado","perk-images/Styles/Precision/CutDown/CutDown.png",8000,3],"8021":["Pies veloces","perk-images/Styles/Precision/FleetFootwork/FleetFootwork.png",8000,0],"8100":["Dominación","perk-images/Styles/7200_Domination.png"],"8105":["Cazador incesante","perk-images/Styles/Domination/RelentlessHunter/RelentlessHunter.png",8100,3],"8106":["Cazador definitivo","perk-images/Styles/Domination/UltimateHunter/UltimateHunter.png",8100,3],"8112":["Electrocutar","perk-images/Styles/Domination/Electrocute/Electrocute.png",8100,0],"8126":["Golpe bajo","perk-images/Styles/Domination/CheapShot/CheapShot.png",8100,1],"8128":["Cosecha oscura","perk-images/Styles/Domination/DarkHarvest/DarkHarvest.png",8100,0],"8135":["Cazador de tesoros","perk-images/Styles/Domination/TreasureHunter/TreasureHunter.png",8100,3],"8137":["Sexto sentido","perk-images/Styles/Domination/SixthSense/SixthSense.png",8100,2],"8139":["Sabor a sangre","perk-images/Styles/Domination/TasteOfBlood/GreenTerror_TasteOfBlood.png",8100,1],"8140":["Recuerdo macabro","perk-images/Styles/Domination/GrislyMementos/GrislyMementos.png",8100,2],"8141":["Guardián de profundidad","perk-images/Styles/Domination/DeepWard/DeepWard.png",8100,2],"8143":["Impacto repentino","perk-images/Styles/Domination/SuddenImpact/SuddenImpact.png",8100,1],"8200":["Brujería","perk-images/Styles/7202_Sorcery.png"],"8210":["Trascendencia","perk-images/Styles/Sorcery/Transcendence/Transcendence.png",8200,2],"8214":["Invocar a Aery","perk-images/Styles/Sorcery/SummonAery/SummonAery.png",8200,0],"8224":["Arcanólogo axiomático","perk-images/Styles/Sorcery/NullifyingOrb/Axiom_Arcanist.png",8200,1],"8226":["Banda de maná","perk-images/Styles/Sorcery/ManaflowBand/ManaflowBand.png",8200,1],"8229":["Cometa arcano","perk-images/Styles/Sorcery/ArcaneComet/ArcaneComet.png",8200,0],"8230":["Tensión del saqueador de tormentas","perk-images/Styles/Sorcery/PhaseRush/StormraidersSurgeRuneIcon2.png",8200,0],"8232":["Caminar sobre agua","perk-images/Styles/Sorcery/Waterwalking/Waterwalking.png",8200,3],"8233":["Concentración absoluta","perk-images/Styles/Sorcery/AbsoluteFocus/AbsoluteFocus.png",8200,2],"8234":["Celeridad","perk-images/Styles/Sorcery/Celerity/CelerityTemp.png",8200,2],"8236":["Se avecina tormenta","perk-images/Styles/Sorcery/GatheringStorm/GatheringStorm.png",8200,3],"8237":["Piroláser","perk-images/Styles/Sorcery/Scorch/Scorch.png",8200,3],"8242":["Inquebrantable","perk-images/Styles/Sorcery/Unflinching/Unflinching.png",8400,3],"8275":["Capa del nimbo","perk-images/Styles/Sorcery/NimbusCloak/6361.png",8200,1],"8299":["Último esfuerzo","perk-images/Styles/Sorcery/LastStand/LastStand.png",8000,3],"8300":["Inspiración","perk-images/Styles/7203_Whimsy.png"],"8304":["Calzado mágico","perk-images/Styles/Inspiration/MagicalFootwear/MagicalFootwear.png",8300,1],"8306":["Destello hextech","perk-images/Styles/Inspiration/HextechFlashtraption/HextechFlashtraption.png",8300,1],"8313":["Tónico triple","perk-images/Styles/Inspiration/PerfectTiming/AlchemistCabinet.png",8300,2],"8316":["Manitas","perk-images/Styles/Inspiration/JackOfAllTrades/JackofAllTrades2.png",8300,3],"8321":["Reembolso","perk-images/Styles/Inspiration/CashBack/CashBack2.png",8300,1],"8345":["Entrega de galletas","perk-images/Styles/Inspiration/BiscuitDelivery/BiscuitDelivery.png",8300,2],"8347":["Perspicacia cósmica","perk-images/Styles/Inspiration/CosmicInsight/CosmicInsight.png",8300,3],"8351":["Mejora glacial","perk-images/Styles/Inspiration/GlacialAugment/GlacialAugment.png",8300,0],"8352":["Tónico de distorsión temporal","perk-images/Styles/Inspiration/TimeWarpTonic/TimeWarpTonic.png",8300,2],"8360":["Libro de hechizos","perk-images/Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png",8300,0],"8369":["Primer golpe","perk-images/Styles/Inspiration/FirstStrike/FirstStrike.png",8300,0],"8400":["Valor","perk-images/Styles/7204_Resolve.png"],"8401":["Golpe de escudo","perk-images/Styles/Resolve/MirrorShell/MirrorShell.png",8400,1],"8410":["Velocidad de acercamiento","perk-images/Styles/Resolve/ApproachVelocity/ApproachVelocity.png",8300,3],"8429":["Condicionamiento","perk-images/Styles/Resolve/Conditioning/Conditioning.png",8400,2],"8437":["Garras del inmortal","perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png",8400,0],"8439":["Reverberacción","perk-images/Styles/Resolve/VeteranAftershock/VeteranAftershock.png",8400,0],"8444":["Fuerzas renovadas","perk-images/Styles/Resolve/SecondWind/SecondWind.png",8400,2],"8446":["Demoler","perk-images/Styles/Resolve/Demolish/Demolish.png",8400,1],"8451":["Sobrecrecimiento","perk-images/Styles/Resolve/Overgrowth/Overgrowth.png",8400,3],"8453":["Revitalizar","perk-images/Styles/Resolve/Revitalize/Revitalize.png",8400,3],"8463":["Fuente de vida","perk-images/Styles/Resolve/FontOfLife/FontOfLife.png",8400,1],"8465":["Protector","perk-images/Styles/Resolve/Guardian/Guardian.png",8400,0],"8473":["Revestimiento de huesos","perk-images/Styles/Resolve/BonePlating/BonePlating.png",8400,2],"8992":["Toque de muerte ígnea","perk-images/Styles/Sorcery/DeathfireTouch/DEATHFIRE_TOUCH_KEYSTONE.png",8200,0],"9101":["Absorber vida","perk-images/Styles/Precision/AbsorbLife/AbsorbLife.png",8000,1],"9103":["Leyenda: Linaje","perk-images/Styles/Precision/LegendBloodline/LegendBloodline.png",8000,2],"9104":["Leyenda: Presteza","perk-images/Styles/Precision/LegendAlacrity/LegendAlacrity.png",8000,2],"9105":["Leyenda: Velocidad","perk-images/Styles/Precision/LegendHaste/LegendHaste.png",8000,2],"9111":["Triunfo","perk-images/Styles/Precision/Triumph.png",8000,1],"9923":["Lluvia de cuchillas","perk-images/Styles/Domination/HailOfBlades/HailOfBlades.png",8100,0]};

  const OWNED = [35, 102, 876, 203, 234, 56, 64, 254, 59, 5, 120, 113, 20, 19, 77, 11, 141, 121, 107, 104, 79, 32, 33, 28, 60, 9, 30, 131, 245, 106, 517, 154, 48, 72, 421, 200, 233, 62, 2, 76, 103, 99, 1, 22, 51, 222, 81, 86, 122, 24, 54, 412, 89, 111, 25, 117, 16, 267, 157, 238, 91, 84, 7, 134, 61, 112, 145, 202, 236, 67, 21, 18, 53, 555, 497];

  // ---------- PRNG con semilla para que los datos sean estables ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const hash = s => [...String(s)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const NOW = Date.now();
  const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'];
  const DIVS = ['IV', 'III', 'II', 'I'];
  const rankValue = (t, d, lp) => TIERS.indexOf(t) * 400 + DIVS.indexOf(d) * 100 + lp;
  const valueToRank = v => ({ tier: TIERS[Math.floor(v / 400)], division: DIVS[Math.floor((v % 400) / 100)], lp: v % 100 });

  // ---------- Estado ----------
  const champions = {
    version: '16.21.1',
    all: CH.map(([id, name, key]) => ({ id, name, key })),
    owned: OWNED,
    spells: Object.fromEntries(Object.entries(SPELLS).map(([id, [key, name]]) => [id, { key, name }])),
    // Como el ddragon.js real: cada runa con su arbol (style) y fila (slot), para pintar el arbol completo
    runes: Object.fromEntries(Object.entries({ ...RUNES, ...RUNES_FULL }).map(([id, [name, icon, style, slot]]) => [id, style ? { name, icon, style, slot } : { name, icon }])),
    items: Object.fromEntries(Object.entries(ITEMS).map(([id, [name, gold]]) => [id, { name, gold }])),
  };

  const config = {
    autoAccept: true, acceptDelay: 2,
    pick: { id: 35, name: 'Shaco' }, autoLock: false,
    ban: { id: 64, name: 'Lee Sin' },
    role: 'jungle',
    startWithWindows: true,
    autoImport: { runes: true, spells: true, items: true },
    otpBuilds: true,
    overlay: { enabled: true, objectives: true, goldDiff: true, skillOrder: true, cs: true, sound: true, side: 'right', scale: 1 },
    csTarget: 7, csAuto: true,
    ai: 'local',
    theme: 'dark',
  };

  const summoner = { gameName: 'Artiloked', tagLine: 'EUW', profileIconId: 4568, level: 412 };
  const keys = { riot: true, anthropic: true };
  const ai = { mode: 'local', local: true, api: true, ready: true };

  const recs = {
    counter: { title: 'Contra Shaco (jungla, % de derrotas, U.GG):', empty: 'Sin counters claros en U.GG', items: [
      { id: 64, name: 'Lee Sin', text: '54%', tip: 'Shaco gana el 46.3% contra Lee Sin (2466 partidas)' },
      { id: 121, name: "Kha'Zix", text: '55%', tip: "Shaco gana el 45.5% contra Kha'Zix (1493 partidas)" },
      { id: 246, name: 'Qiyana', text: '54%', tip: 'Shaco gana el 45.9% contra Qiyana (1514 partidas)' },
      { id: 254, name: 'Vi', text: '56%', tip: 'Shaco gana el 44.0% contra Vi (781 partidas)' },
    ] },
    global: { title: 'Global (jungla, % de derrotas, OP.GG):', empty: 'Sin datos de OP.GG', items: [
      { id: 64, name: 'Lee Sin', text: '54%', tip: 'Lee Sin hace perder el 54% de las partidas a los junglas que se enfrentan a él (Esmeralda+).' },
      { id: 234, name: 'Viego', text: '53%', tip: 'Viego: 53% de derrotas para el rival de jungla.' },
      { id: 56, name: 'Nocturne', text: '52%', tip: 'Nocturne: 52% de derrotas para el rival de jungla.' },
      { id: 200, name: "Bel'Veth", text: '52%', tip: "Bel'Veth: 52% de derrotas para el rival de jungla." },
    ] },
    mine: { title: 'Para ti (derrotas/partidas, 24 partidas con él):', empty: 'Aún no hay suficientes partidas', items: [
      { id: 254, name: 'Vi', text: '5/7', tip: 'Has perdido 5 de 7 partidas contra Vi.' },
      { id: 421, name: "Rek'Sai", text: '4/5', tip: "Has perdido 4 de 5 partidas contra Rek'Sai." },
      { id: 107, name: 'Rengar', text: '3/4', tip: 'Has perdido 3 de 4 partidas contra Rengar.' },
    ] },
  };

  // Builds de ejemplo por campeon
  const BUILDS = {
    35: { games: 12480, winRate: .521, runes: { primaryStyle: 8100, subStyle: 8000, perks: [9923, 8143, 8140, 8105, 9104, 8014, 5005, 5008, 5001] }, spells: [11, 4],
      skillOrder: ['W', 'Q', 'E', 'E', 'E', 'R', 'E', 'Q', 'E', 'Q', 'R', 'Q', 'Q', 'W', 'W', 'R', 'W', 'W'], skillPriority: ['E', 'Q', 'W'],
      starter: [1102, 2003], core: [3142, 6698, 6694], boots: [3158], situational: [3814, 3071, 3036] },
    102: { games: 9310, winRate: .534, runes: { primaryStyle: 8000, subStyle: 8200, perks: [8010, 9111, 9104, 8017, 8236, 8232, 5005, 5008, 5001] }, spells: [11, 4],
      skillOrder: ['W', 'Q', 'E', 'W', 'W', 'R', 'W', 'E', 'W', 'E', 'R', 'E', 'E', 'Q', 'Q', 'R', 'Q', 'Q'], skillPriority: ['W', 'E', 'Q'],
      starter: [1101, 2003], core: [3153, 3748, 6333], boots: [3047], situational: [3053, 3742, 3065] },
  };
  const defaultBuild = id => ({ games: 3000 + (id * 37) % 6000, winRate: .49 + ((id * 13) % 50) / 1000, runes: { primaryStyle: 8100, subStyle: 8200, perks: [8112, 8143, 8140, 8106, 8236, 8210, 5008, 5008, 5011] }, spells: [11, 4],
    skillOrder: ['Q', 'W', 'E', 'Q', 'Q', 'R', 'Q', 'W', 'Q', 'W', 'R', 'W', 'W', 'E', 'E', 'R', 'E', 'E'], skillPriority: ['Q', 'W', 'E'], starter: [1103, 2003], core: [6653, 4645, 3157], boots: [3020], situational: [3089, 3135, 3137] });
  const buildFor = id => {
    const b = { championId: id, role: 'jungle', ...(BUILDS[id] || defaultBuild(id)) };
    // Dos builds completas y coherentes (como buildsets.js), con objetos por situacion
    b.vs = 64;
    const context = kind => [
      { key: 'mr', label: 'Si te hacen mucho daño mágico', items: kind === 'ap' ? [3102, 4401, 2504] : [3156, 3139, 4401] },
      { key: 'armor', label: 'Si te hacen mucho daño físico', items: kind === 'ap' ? [3157, 6665, 3742] : [3026, 6333, 3143] },
      { key: 'antiheal', label: 'Contra curaciones', items: kind === 'ap' ? [3165] : [3033, 6609] },
      { key: 'antitank', label: 'Contra tanques', items: kind === 'ap' ? [3135, 4645, 3137] : [3036, 6694, 3071] },
      { key: 'survive', label: 'Para sobrevivir (burst y control)', items: kind === 'ap' ? [3157, 3102] : [3026, 3814] },
    ];
    // Lista unica de builds (OP.GG primero y despues las de U.GG que no repiten piedra angular y nucleo),
    // cada una con su fuente y sus hechizos, inicial y habilidades, como mergeBuilds/tagBuilds
    const own = { spells: b.spells, starter: b.starter, skillOrder: b.skillOrder, skillPriority: b.skillPriority };
    b.options = [
      { kind: 'ap', label: 'Daño mágico', keystone: 8229, runes: { primaryStyle: 8200, subStyle: 8100, perks: [8229, 8224, 8210, 8236, 8143, 8135, 5008, 5008, 5001] }, core: [2503, 6653, 4005], boots: [3158], situational: [], games: 131, winRate: 0.57, context: context('ap'), source: 'opgg', sources: ['opgg', 'ugg'], key: 'opgg:8229', ...own },
      { kind: 'ad', label: 'Daño físico', keystone: 9923, runes: { primaryStyle: 8100, subStyle: 8000, perks: [9923, 8143, 8140, 8105, 8014, 9104, 5005, 5008, 5001] }, core: [6699, 6676, 3031], boots: [3158], situational: [], games: 102, winRate: 0.49, context: context('ad'), source: 'opgg', sources: ['opgg'], key: 'opgg:9923', ...own },
      { kind: 'ap', label: 'Daño mágico', keystone: 8128, runes: { primaryStyle: 8100, subStyle: 8200, perks: [8128, 8126, 8140, 8106, 8210, 8236, 5007, 5008, 5001] }, core: [2503, 6653, 3089], boots: [3020], situational: [], games: 3316, winRate: 0.57, context: context('ap'), source: 'ugg', sources: ['ugg'], key: 'ugg:8128', ...own, spells: [11, 14] },
      { kind: 'ad', label: 'Daño físico', keystone: 8230, runes: { primaryStyle: 8200, subStyle: 8400, perks: [8230, 8226, 8210, 8237, 8444, 8451, 5008, 5008, 5011] }, core: [6692, 6694, 3071], boots: [3047], situational: [], games: 2050, winRate: 0.51, context: context('ad'), source: 'ugg', sources: ['ugg'], key: 'ugg:8230', ...own },
      // Build OTP (otp.js), con los jugadores de los que sale
      { kind: 'ap', label: 'OTP · Daño mágico', keystone: 8112, runes: { primaryStyle: 8100, subStyle: 8200, perks: [8112, 8139, 8138, 8135, 8210, 8237, 5008, 5008, 5011] }, core: [2503, 4645, 3157], boots: [3020], situational: [], games: 23, winRate: 0.91, context: context('ap'), source: 'otp', sources: ['otp'], key: 'otp:8112', ...own,
        otp: { players: 2, games: 23, share: 1, names: [{ name: 'Zefath#EUW', region: 'EUW', games: 15, wins: 14 }, { name: 'Buggy2v9#EUW', region: 'EUW', games: 8, wins: 7 }],
          matches: [[64, true, 'Zefath#EUW'], [76, false, 'Zefath#EUW'], [121, true, 'Buggy2v9#EUW'], [254, true, 'Zefath#EUW']].map(([vs, win, name], k) => ({
            id: `EUW1_${k}`, name, region: 'EUW', vs, win, t: Date.now() - k * 864e5,
            runes: { primaryStyle: 8200, subStyle: 8100, perks: [8229, 8224, 8210, 8236, 8143, 8135, 5007, 5008, 5011] }, spells: [11, 4], items: [3020, 2503, 4645, 3157, 3089] })) } },
    ];
    Object.assign(b, { runes: b.options[0].runes, core: b.options[0].core, context: b.options[0].context, enemyFlags: ['armor'] });
    return b;
  };

  const PICKS = [
    { championId: 35, score: 7.4, metaTier: 2, metaWinRate: .521, personal: { games: 24, winRate: .58 }, tags: ['Counter', 'Tu pool', 'Meta'], reasons: ['Gana a Vi en jungla (55% en OP.GG)', 'Llevas un 58% de victorias en 24 partidas', 'Tier 2 en el meta actual (52%)', 'Tu equipo no tiene daño de asesino'] },
    { championId: 102, score: 5.9, metaTier: 1, metaWinRate: .534, personal: { games: 15, winRate: .53 }, tags: ['Tu pool', 'Meta'], reasons: ['Tier 1 en jungla (53%)', 'Llevas un 53% en 15 partidas', 'Escala bien contra un equipo de cuerpo a cuerpo'] },
    { championId: 876, score: 3.8, metaTier: 2, metaWinRate: .515, personal: { games: 6, winRate: .5 }, tags: ['Counter'], reasons: ['Gana a Vi en jungla (53%)', 'Daño mágico: tu equipo va cargado de daño físico'] },
    { championId: 203, score: 2.6, metaTier: 2, metaWinRate: .508, personal: { games: 4, winRate: .75 }, tags: ['Tu pool'], reasons: ['Llevas 3 de 4 victorias', 'Buen control de objetivos tempranos'] },
    { championId: 234, score: 1.9, metaTier: 1, metaWinRate: .512, personal: null, tags: ['Meta'], reasons: ['Tier 1 en jungla', 'Sin partidas tuyas con él'] },
    { championId: 56, score: .8, metaTier: 3, metaWinRate: .503, personal: { games: 2, winRate: .5 }, tags: [], reasons: ['Bueno para cerrar partidas con su definitiva', 'Pocas partidas tuyas'] },
    { championId: 20, score: -.6, metaTier: 3, metaWinRate: .497, personal: null, tags: ['Counter'], reasons: ['Gana a Vi en el early (51%)', 'Win rate en el meta por debajo de la media'] },
    { championId: 120, score: -1.4, metaTier: 4, metaWinRate: .489, personal: { games: 3, winRate: .33 }, tags: [], reasons: ['Pierde contra Vi (47%)', 'Llevas 1 de 3 victorias'] },
  ];

  function makeDraft(stage) {
    if (stage === 'none') return { active: false, role: 'jungle', myChampionId: null, locked: false, allies: [], enemies: [], bans: { ally: [], enemy: [] }, picks: [], build: null, imported: { runes: null, spells: null, items: null, message: '' }, loading: false, error: null };
    const locked = stage === 'locked';
    return {
      active: true, role: 'jungle', myChampionId: 35, locked,
      matchup: { vs: 64, winRate: 0.537, games: 2466, patch: '16_21' },
      matchupCheck: {
        me: 35, vs: 64, role: 'jungle',
        matchup: { winRate: 0.537, games: 2466, source: 'U.GG' }, opgg: { winRate: 0.5405, games: 2851, source: 'OP.GG' },
        lane: 'vs', soloKill: 'even', style: 'defensivo',
        mains: {
          games: 34, wins: 20, winRate: 20 / 34,
          players: [{ name: 'PinkWard#Laugh', region: 'NA', games: 22, wins: 13 }, { name: 'Shaco Mid Lane#EUW', region: 'EUW', games: 12, wins: 7 }],
          runes: { primaryStyle: 8100, subStyle: 8300, perks: [8128, 8143, 8138, 8135, 8345, 8347, 5005, 5008, 5011] }, runeGames: 25, runeWinRate: 0.6,
          matches: [[true, 'PinkWard#Laugh'], [false, 'Shaco Mid Lane#EUW'], [true, 'PinkWard#Laugh']].map(([win, name], k) => ({
            id: `NA1_${k}`, name, region: name.endsWith('EUW') ? 'EUW' : 'NA', vs: 64, win, t: Date.now() - k * 2 * 864e5,
            runes: { primaryStyle: 8100, subStyle: 8300, perks: [8128, 8143, 8138, 8135, 8345, 8347, 5005, 5008, 5011] }, spells: [11, 4], items: [3158, 6692, 3142, 6694, 3814] })),
        },
        compare: {
          me: { winRate: 0.5085, tier: 2, info: { attack: 8, defense: 4, magic: 6, difficulty: 9 }, scaling: 0.049,
            lengths: [[0, '<25', 0.498], [25, '25-30', 0.489], [30, '30-35', 0.514], [35, '35-40', 0.532], [40, '40+', 0.552]].map(([from, label, rate]) => ({ from, label, rate })) },
          vs: { winRate: 0.492, tier: 2, info: { attack: 8, defense: 5, magic: 3, difficulty: 6 }, scaling: -0.03,
            lengths: [[0, '<25', 0.521], [25, '25-30', 0.503], [30, '30-35', 0.488], [35, '35-40', 0.476], [40, '40+', 0.47]].map(([from, label, rate]) => ({ from, label, rate })) },
        },
        tips: {
          data: ['Enfrentamiento favorable (54 %): puedes buscar ventaja pronto.', 'Al principio suele ir mejor Lee Sin: evita los duelos igualados hasta tener ventaja de nivel u objeto.', 'Escalas mejor que Lee Sin: si la partida se alarga, tus opciones suben.'],
          opgg: 'Lee Sin is strongest early. Track his first clear and avoid contesting scuttle without lane priority.',
          against: ['Mantente agrupado con tu equipo para minimizar el impacto de Patada del dragón.', 'Lee Sin tiene muchas formas de aproximarse: los guardianes cerca de tu jungla te ayudan a verle venir.'],
          mine: ['Usar Engaño sobre el terreno puede ayudarte a escapar.', 'Las Cajas sorpresa son útiles para emboscadas en la jungla.'],
        },
      },
      allies: [
        { cellId: 0, championId: 266, position: 'top', isMe: false },
        { cellId: 1, championId: 35, position: 'jungle', isMe: true },
        { cellId: 2, championId: locked ? 103 : 0, position: 'middle', isMe: false },
        { cellId: 3, championId: 222, position: 'bottom', isMe: false },
        { cellId: 4, championId: locked ? 412 : 0, position: 'utility', isMe: false },
      ],
      enemies: [{ cellId: 5, championId: 254 }, { cellId: 6, championId: 122 }, { cellId: 7, championId: locked ? 134 : 0 }, { cellId: 8, championId: 0 }, { cellId: 9, championId: 0 }],
      bans: { ally: [64, 234, 56, 200, 0], enemy: [157, 777, 238, 91, locked ? 121 : 0] },
      picks: PICKS,
      build: buildFor(35),
      imported: locked ? { runes: 'ok', spells: 'ok', items: 'ok', message: 'Runas, hechizos y objetos importados' } : { runes: null, spells: null, items: null, message: '' },
      loading: false, error: null,
    };
  }

  function makeScouting() {
    const P = (team, isMe, riotId, championId, spells, rank, mastery, tags, hotStreak = false) => ({ team, isMe, riotId, championId, spells, rank, mastery, tags, hotStreak });
    return {
      active: true, loading: false, error: null,
      players: [
        P('ally', false, 'Rengo Destructor#EUW', 266, [4, 12], { tier: 'EMERALD', division: 'I', lp: 41, wins: 188, losses: 171 }, { level: 18, points: 214000 }, ['Main']),
        P('ally', true, 'Artiloked#EUW', 35, [11, 4], { tier: 'EMERALD', division: 'II', lp: 93, wins: 310, losses: 297 }, { level: 41, points: 486300 }, ['OTP']),
        P('ally', false, 'zorro azul#1312', 103, [4, 14], { tier: 'EMERALD', division: 'III', lp: 12, wins: 95, losses: 102 }, { level: 7, points: 61000 }, []),
        P('ally', false, 'PiumPium#ESP', 222, [7, 4], { tier: 'DIAMOND', division: 'IV', lp: 0, wins: 64, losses: 58 }, { level: 12, points: 132500 }, ['Recién ascendido']),
        P('ally', false, 'Abrazos Gratis#EUW', 412, [4, 14], { tier: 'EMERALD', division: 'II', lp: 55, wins: 240, losses: 250 }, { level: 23, points: 268000 }, []),
        P('enemy', false, 'Vi del Barrio#EUW', 254, [11, 4], { tier: 'EMERALD', division: 'I', lp: 77, wins: 141, losses: 118 }, { level: 38, points: 452000 }, ['OTP', 'En racha'], true),
        P('enemy', false, 'Noxus Arriba#GOD', 122, [4, 12], { tier: 'EMERALD', division: 'II', lp: 20, wins: 52, losses: 61 }, { level: 9, points: 88000 }, []),
        P('enemy', false, 'Midlaner Triste#000', 134, [4, 14], { tier: 'PLATINUM', division: 'I', lp: 88, wins: 33, losses: 22 }, null, ['Nuevo con él']),
        P('enemy', false, 'Kaisa Enjoyer#UWU', 145, [7, 4], { tier: 'EMERALD', division: 'III', lp: 64, wins: 208, losses: 201 }, { level: 15, points: 167000 }, []),
        P('enemy', false, 'xMantequillax#EUW', 89, [4, 3], null, { level: 4, points: 22100 }, ['Sin clasificar']),
      ],
    };
  }

  // ---------- Historial ----------
  const POOL = [35, 35, 35, 35, 102, 102, 102, 876, 203, 234, 35, 102, 56];
  const OPP = [254, 64, 234, 56, 200, 121, 107, 421, 59, 5, 120, 113];
  function makeMatch(i) {
    const r = rng(1000 + i);
    const championId = POOL[Math.floor(r() * POOL.length)];
    const win = [1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0][i] === 1;
    const remake = i === 13;
    const durationSec = remake ? 212 : Math.round(1380 + r() * 900);
    const min = durationSec / 60;
    const cs = remake ? 8 : Math.round(min * (5.2 + r() * 2.2));
    const kills = remake ? 0 : Math.round(r() * (win ? 12 : 7));
    const deaths = remake ? 0 : Math.round(1 + r() * (win ? 5 : 8));
    const assists = remake ? 0 : Math.round(r() * 14);
    const b = buildFor(championId);
    return {
      matchId: `EUW1_80255${String(83944 - i * 1371).padStart(5, '0')}`,
      queue: i % 6 === 4 ? 'Clasificatoria Flexible' : 'Clasificatoria Solo/Dúo',
      championId, role: 'jungle', win: remake ? false : win, kills, deaths, assists, cs,
      csPerMin: Math.round(cs / min * 10) / 10, durationSec,
      endedAt: NOW - (i * 5.3 + 1.2) * 3600 * 1000,
      items: remake ? [1102, 0, 0, 0, 0, 0, 3340] : [b.core[0], b.boots[0], b.core[1], i % 3 ? b.core[2] : 0, i % 2 ? b.situational[0] : 0, 2055, 3364],
      spells: b.spells, keystone: b.runes.perks[0], subStyle: b.runes.subStyle,
      visionScore: Math.round(min * (0.8 + r() * .7)), killParticipation: remake ? 0 : Math.round((0.4 + r() * .35) * 100) / 100,
      damage: Math.round(min * (500 + r() * 500)), remake,
    };
  }
  const matches = Array.from({ length: 20 }, (_, i) => makeMatch(i));

  function makeAnalysis(summary) {
    const r = rng(hash(summary.matchId));
    const mins = Math.max(4, Math.floor(summary.durationSec / 60));
    const minutes = Array.from({ length: mins + 1 }, (_, i) => i);
    const trend = summary.win ? 1 : -1;
    let g = 0, x = 0, c = 0;
    const goldDiff = [], xpDiff = [], csDiff = [];
    for (const m of minutes) {
      if (m > 1) { g += (r() - .45 + trend * .12) * 260; x += (r() - .45 + trend * .1) * 200; c += Math.round((r() - .5 + trend * .1) * 3); }
      goldDiff.push(Math.round(g)); xpDiff.push(Math.round(x)); csDiff.push(c);
    }
    const spots = [[3800, 7600], [5230, 9120], [7400, 6800], [9800, 4300], [10500, 8200], [4400, 11300], [12100, 5200], [7200, 10300], [2700, 5100]];
    const deaths = Array.from({ length: summary.deaths }, (_, i) => {
      const s = spots[Math.floor(r() * spots.length)];
      return { t: Math.round((i + 1) / (summary.deaths + 1) * summary.durationSec + r() * 60), x: s[0] + Math.round((r() - .5) * 900), y: s[1] + Math.round((r() - .5) * 900), killerChampionId: OPP[Math.floor(r() * OPP.length)] };
    });
    const opp = OPP[Math.floor(r() * OPP.length)];
    const early = deaths.filter(d => d.t < 600).length;
    const tips = [];
    if (early >= 2) tips.push({ severity: 'high', title: 'Mueres pronto', detail: `${early} muertes antes del minuto 10. Juega alrededor de tu visión y evita invadir sin información.` });
    if (summary.csPerMin < 6.5) tips.push({ severity: 'mid', title: 'Farmeo mejorable', detail: `${summary.csPerMin.toString().replace('.', ',')} CS/min frente a tu objetivo de 7. Encadena campamentos entre gankeos.` });
    tips.push({ severity: 'mid', title: 'Dragones sin preparar', detail: 'El equipo rival consiguió 2 de los 3 primeros dragones. Llega 45 s antes y limpia la visión del río.' });
    tips.push({ severity: 'low', title: 'Buena participación', detail: `Participaste en el ${Math.round(summary.killParticipation * 100)}% de las bajas de tu equipo.` });
    return {
      matchId: summary.matchId, summary,
      opponent: summary.remake ? null : { championId: opp, riotId: 'Rival Jungla#EUW' },
      timeline: summary.remake ? { minutes: [], goldDiff: [], xpDiff: [], csDiff: [] } : { minutes, goldDiff, xpDiff, csDiff },
      at10: summary.remake ? null : { cs: Math.round(52 + r() * 22), goldDiff: goldDiff[10], xpDiff: xpDiff[10] },
      at15: mins >= 15 ? { cs: Math.round(82 + r() * 30), goldDiff: goldDiff[15], xpDiff: xpDiff[15] } : null,
      deaths,
      comparison: [
        { label: 'CS/min', value: summary.csPerMin, avg: 6.8, better: summary.csPerMin >= 6.8, format: 'number' },
        { label: 'KDA', value: summary.deaths ? (summary.kills + summary.assists) / summary.deaths : summary.kills + summary.assists, avg: 3.1, better: (summary.kills + summary.assists) / Math.max(1, summary.deaths) >= 3.1, format: 'number' },
        { label: 'Participación en bajas', value: summary.killParticipation, avg: .56, better: summary.killParticipation >= .56, format: 'percent' },
        { label: 'Visión/min', value: Math.round(summary.visionScore / (summary.durationSec / 60) * 10) / 10, avg: 1.1, better: summary.visionScore / (summary.durationSec / 60) >= 1.1, format: 'number' },
        { label: 'Daño a campeones', value: summary.damage, avg: 19800, better: summary.damage >= 19800, format: 'integer' },
      ],
      tips,
    };
  }

  function makeProfile() {
    // Historial de LP de Solo/Duo: termina en Esmeralda II 93 LP
    const lp = [];
    let v = rankValue('EMERALD', 'II', 93);
    const soloMatches = matches.filter(m => m.queue.includes('Solo') && !m.remake);
    const vals = [v];
    for (const m of soloMatches) { v -= m.win ? 21 : -19; vals.push(v); }
    vals.reverse();
    const times = [NOW - 120 * 3600 * 1000, ...soloMatches.map(m => m.endedAt).reverse()];
    // Historia de un año (de Oro a Esmeralda) para probar los periodos y los colores por rango
    const oldest = rankValue('GOLD', 'II', 20);
    for (let i = 0; i < 60; i++) {
      const val = Math.round(oldest + (vals[0] - oldest) * i / 60 + Math.sin(i * 1.7) * 45);
      const rk = valueToRank(val);
      lp.push({ t: times[0] - (60 - i) * 6 * 864e5, queue: 'RANKED_SOLO_5x5', value: val, label: `${rk.tier} ${rk.division} ${rk.lp} LP`, estimated: true });
    }
    vals.forEach((val, i) => { const rk = valueToRank(val); lp.push({ t: times[i], queue: 'RANKED_SOLO_5x5', value: val, label: `${rk.tier} ${rk.division} ${rk.lp} LP` }); });
    let f = rankValue('PLATINUM', 'I', 40);
    [1, 1, 0, 1].forEach((w, i) => { const rk = valueToRank(f); lp.push({ t: NOW - (100 - i * 20) * 3600 * 1000, queue: 'RANKED_FLEX_SR', value: f, label: `${rk.tier} ${rk.division} ${rk.lp} LP` }); f += w ? 22 : -18; });
    const real = matches.filter(m => !m.remake);
    const wins = real.filter(m => m.win).length;
    const byChamp = {};
    for (const m of real) {
      const c = byChamp[m.championId] ||= { championId: m.championId, games: 0, wins: 0, k: 0, d: 0, a: 0, cs: 0, min: 0 };
      c.games++; c.wins += m.win ? 1 : 0; c.k += m.kills; c.d += m.deaths; c.a += m.assists; c.cs += m.cs; c.min += m.durationSec / 60;
    }
    return {
      loading: false, error: null, updatedAt: NOW - 4 * 60 * 1000,
      summoner,
      ranked: [
        { queue: 'RANKED_SOLO_5x5', tier: 'EMERALD', division: 'II', lp: 93, wins: 310, losses: 297, hotStreak: false },
        { queue: 'RANKED_FLEX_SR', tier: 'PLATINUM', division: 'I', lp: 66, wins: 41, losses: 35, hotStreak: true },
      ],
      lpHistory: lp,
      recent: { games: real.length, wins, kda: 3.1, csPerMin: 6.8, visionPerMin: 1.1, killParticipation: .56 },
      champions: Object.values(byChamp).sort((a, b) => b.games - a.games).map(c => ({ championId: c.championId, games: c.games, wins: c.wins, kda: Math.round((c.k + c.a) / Math.max(1, c.d) * 100) / 100, csPerMin: Math.round(c.cs / c.min * 10) / 10 })),
      roles: [{ role: 'jungle', games: real.length - 3, wins: wins - 1 }, { role: 'top', games: 2, wins: 1 }, { role: 'support', games: 1, wins: 0 }],
      matches,
    };
  }

  // ---------- Partida en directo ----------
  const live = { active: false };
  function makeLive(t = 754.2) {
    return {
      active: true, gameTime: t, myChampionId: 35,
      objectives: [
        { key: 'dragon', label: 'Dragón', detail: 'Infernal', state: 'respawning', spawnAt: 812, team: 'ally' },
        { key: 'grubs', label: 'Larvas del Vacío', detail: null, state: 'gone', spawnAt: null, team: 'ally' },
        { key: 'herald', label: 'Heraldo', detail: null, state: 'pending', spawnAt: 900, team: null },
        { key: 'baron', label: 'Barón Nashor', detail: null, state: 'pending', spawnAt: 1200, team: null },
        { key: 'inhib_bot', label: 'Inhibidor inferior', detail: 'Enemigo', state: 'respawning', spawnAt: 1010, team: 'ally' },
      ],
      buffs: [{ key: 'baron', label: 'Barón', team: 'enemy', endsAt: t + 95 }],
      gold: { ally: 24300, enemy: 22100, diff: 2200 },
      cs: { total: 98, perMin: 6.4, target: 6.6, auto: { perMin: 6.6, csPerGame: 185, minutes: 28, role: 'jungle', championId: 35 } },
      skillToLevel: 'E',
      itemAdvice: {
        reasons: ['3 enemigos hacen sobre todo daño mágico', '2 enemigos se curan con robo de vida u omnivampirismo'],
        groups: [
          { key: 'mr', label: 'Si te hacen mucho daño mágico', items: [3102, 4401, 2504], recommended: true },
          { key: 'antiheal', label: 'Contra curaciones', items: [3165], recommended: true },
          { key: 'armor', label: 'Si te hacen mucho daño físico', items: [3157, 6665], recommended: false },
          { key: 'antitank', label: 'Contra tanques', items: [3135, 4645], recommended: false },
          { key: 'survive', label: 'Para sobrevivir (burst y control)', items: [3157, 3102], recommended: false },
        ],
      },
      // Como el proceso principal real: mas reciente primero y el texto con el minuto delante
      events: [
        { time: 712, text: '11:52 Tu equipo ha matado al Dragón Infernal' },
        { time: 690, text: '11:30 Habéis destruido el inhibidor inferior' },
        { time: 598, text: '9:58 El equipo enemigo ha hecho un ace' },
        { time: 512, text: '8:32 Tu equipo ha matado al Dragón de Montaña' },
        { time: 466, text: '7:46 Tu equipo ha matado a las larvas del vacío' },
        { time: 312, text: '5:12 Primera sangre: Artiloked' },
      ],
      notify: null,
    };
  }
  let liveTimer = null, notifyId = 0;
  const NOTIFS = [['Dragón en 60 s', 'objective'], ['Heraldo en 60 s', 'objective'], ['Te sobra oro: compra Hidra profana', 'item'], ['Tienes un punto de habilidad: sube E', 'skill']];
  function startLive() {
    stopLive();
    Object.assign(live, makeLive());
    let ticks = 0;
    liveTimer = setInterval(() => {
      ticks++;
      live.gameTime += 1;
      for (const o of live.objectives) {
        if ((o.state === 'pending' || o.state === 'respawning') && o.spawnAt && live.gameTime >= o.spawnAt) o.state = 'alive';
      }
      live.cs.total += ticks % 4 === 0 ? 1 : 0;
      live.cs.perMin = Math.round(live.cs.total / (live.gameTime / 60) * 10) / 10;
      live.notify = null;
      if (ticks % 12 === 3) { const [text, kind] = NOTIFS[notifyId % NOTIFS.length]; live.notify = { id: ++notifyId, text, kind }; }
      // El proceso principal manda datos cada ~2 s: la interfaz interpola entre medias
      if (ticks % 2 === 0 || live.notify) emit('live', live);
    }, 1000);
  }
  function stopLive() { clearInterval(liveTimer); liveTimer = null; }

  // ---------- Escenarios ----------
  const db = {
    config, champions, recs,
    state: { connected: true, phase: 'Lobby', status: { text: 'En la sala\nEsperando a que empiece la cola', color: 'blue' }, acceptedCount: 3, summoner, keys, ai,
      update: { version: '1.2.4', state: 'latest', next: null, percent: null } },
    draft: makeDraft('none'),
    scouting: { active: false, loading: false, error: null, players: [] },
    live,
    profile: makeProfile(),
    postgame: { loading: false, error: null, analysis: null },
  };

  const listeners = {};
  function emit(channel, data) {
    if (data !== undefined) db[channel] = data;
    for (const fn of listeners[channel] || []) setTimeout(() => fn(clone(db[channel])), 0);
  }
  function setState(patch) { Object.assign(db.state, patch); emit('state'); }

  // Colas como las da companion.queueList
  const MOCK_QUEUES = [
    { id: 420, name: 'Clasificatoria Solo/Dúo', group: 'Clasificatorias' }, { id: 440, name: 'Clasificatoria Flexible', group: 'Clasificatorias' },
    { id: 400, name: 'Normal (reclutamiento)', group: 'Normales y modos' }, { id: 480, name: 'Partida rápida', group: 'Normales y modos' },
    { id: 450, name: 'ARAM', group: 'Normales y modos' }, { id: 2400, name: 'ARAM: Caos', group: 'Normales y modos' },
    { id: 1750, name: 'Arena', group: 'Normales y modos' }, { id: 890, name: 'Intermedio', group: 'Contra la IA' },
  ];
  const PHASES = {
    closed() { stopLive(); setState({ connected: false, phase: 'None', status: { text: 'Esperando al cliente de LoL...', color: 'gray' }, summoner: null }); emit('draft', makeDraft('none')); emit('scouting', { active: false, players: [] }); emit('live', { active: false }); },
    lobby() { stopLive(); setState({ connected: true, phase: 'Lobby', summoner, status: { text: 'En la sala\nEsperando a que empiece la cola', color: 'blue' },
      lobby: { invitations: [{ id: 'inv1', from: 'Kap0#EUW', queue: 'Clasificatoria Flexible' }], canSearch: true, queue: 'Clasificatoria Solo/Dúo', searching: null,
        queues: MOCK_QUEUES, queueId: 420, isLeader: true, members: 1, positions: { first: 'JUNGLE', second: 'MIDDLE' } } }); emit('draft', makeDraft('none')); emit('scouting', { active: false, players: [] }); emit('live', { active: false }); },
    matchmaking() { setState({ connected: true, phase: 'Matchmaking', summoner, status: { text: 'Buscando partida\nSe aceptará automáticamente', color: 'blue' }, lobby: { invitations: [], canSearch: false, searching: { time: 83, estimated: 140 } } }); },
    champselect() { stopLive(); setState({ connected: true, phase: 'ChampSelect', summoner, acceptedCount: db.state.acceptedCount + 1, status: { text: 'Selección de campeones\nShaco preseleccionado', color: 'green' } }); emit('draft', makeDraft('picking')); },
    locked() { setState({ connected: true, phase: 'ChampSelect', status: { text: 'Selección de campeones\nShaco bloqueado', color: 'green' } }); emit('draft', makeDraft('locked')); },
    loading() { stopLive(); setState({ connected: true, phase: 'GameStart', status: { text: 'Cargando partida', color: 'green' } }); emit('draft', makeDraft('none')); emit('live', { active: false }); emit('scouting', makeScouting()); },
    scoutingLoading() { stopLive(); setState({ connected: true, phase: 'GameStart', status: { text: 'Cargando partida', color: 'green' } }); emit('live', { active: false }); emit('scouting', { active: true, loading: true, error: null, players: [] }); },
    ingame() { setState({ connected: true, phase: 'InProgress', status: { text: 'En partida\nOverlay activo', color: 'green' } }); emit('draft', makeDraft('none')); startLive(); emit('live', live); },
    postgame() {
      stopLive();
      setState({ connected: true, phase: 'EndOfGame', status: { text: 'Fin de la partida\nAnalizando...', color: 'blue' } });
      emit('live', { active: false }); emit('scouting', { active: false, players: [] });
      const summary = { ...makeMatch(0), matchId: 'EUW1_8025599999', endedAt: Date.now() - 60000, win: true, kills: 9, deaths: 4, assists: 12 };
      emit('postgame', { loading: true, error: null, analysis: null });
      setTimeout(() => emit('postgame', { loading: false, error: null, analysis: makeAnalysis(summary) }), 600);
    },
    noAiKey() { keys.anthropic = false; Object.assign(ai, { local: false, api: false, ready: false }); setState({ keys, ai: { ...ai } }); },
    draftError() { emit('draft', { ...makeDraft('picking'), picks: [], build: null, error: 'OP.GG no responde. Las recomendaciones usan solo tu historial.' }); },
    nokey() { keys.riot = false; keys.anthropic = false; setState({ keys }); emit('profile', { loading: false, error: null, summoner, ranked: null, lpHistory: null, recent: null, champions: [], roles: [], matches: [] }); },
    withkey() { keys.riot = true; keys.anthropic = true; setState({ keys }); emit('profile', makeProfile()); },
    profileLoading() { emit('profile', { loading: true, error: null, summoner }); },
    profileError() { emit('profile', { loading: false, error: 'La API de Riot ha devuelto 429 (demasiadas peticiones). Reintenta en un minuto.', summoner }); },
    draftLoading() { emit('draft', { ...makeDraft('picking'), picks: [], build: null, loading: true }); },
  };

  // ---------- API ----------
  window.api = {
    async init() { await delay(150); return clone(db); },
    on(channel, fn) { (listeners[channel] ||= []).push(fn); },
    setConfig(patch) {
      for (const [k, v] of Object.entries(patch || {})) {
        if ((k === 'pick' || k === 'ban') && typeof v === 'string') {
          const c = champions.all.find(x => x.name.toLowerCase() === v.toLowerCase());
          config[k] = c ? { id: c.id, name: c.name } : null;
        } else if (v && typeof v === 'object' && !Array.isArray(v) && config[k] && typeof config[k] === 'object' && k !== 'pick' && k !== 'ban') {
          Object.assign(config[k], v);
        } else config[k] = v;
      }
      emit('config');
      if ('ai' in (patch || {})) { ai.mode = config.ai; ai.ready = ai.mode === 'api' ? keys.anthropic : ai.local; setState({ ai: { ...ai } }); }
    },
    async setSecret(name, value) {
      await delay(700);
      if (!value) { keys[name] = false; setState({ keys }); return { ok: true }; }
      const valid = name === 'riot' ? /^RGAPI-/.test(value) : /^sk-ant-/.test(value);
      if (!valid) return { ok: false, error: name === 'riot' ? 'Riot ha rechazado la clave (403). Comprueba que no haya caducado: las claves de desarrollo duran 24 h.' : 'Anthropic ha rechazado la clave (401).' };
      keys[name] = true; setState({ keys });
      if (name === 'riot') emit('profile', makeProfile());
      return { ok: true };
    },
    async action(name, args = {}) {
      switch (name) {
        case 'refreshProfile':
          emit('profile', { ...db.profile, loading: true });
          await delay(900);
          emit('profile', makeProfile());
          return true;
        case 'getMatch': {
          await delay(450);
          if (db.postgame.analysis?.matchId === args.matchId) return clone(db.postgame.analysis);
          const m = matches.find(x => x.matchId === args.matchId);
          if (!m) throw new Error('Partida no encontrada');
          return makeAnalysis(m);
        }
        case 'askCoach':
          await delay(1600);
          if (!keys.anthropic) throw new Error('No hay clave de IA configurada');
          return { text: '## Resumen\nPartida con **buen inicio**: llegaste al minuto 10 con ventaja de oro gracias al gankeo a la línea superior.\n\n## Qué mejorar\n- Tres de tus muertes fueron en el río enemigo **sin visión**. Compra un Guardián de control en cada vuelta a base.\n- Entre los minutos 14 y 20 bajaste a 5,1 CS/min: encadena campamentos en lugar de esperar en línea.\n- Llegaste tarde a los dos primeros dragones; prepáralos con 45 s de antelación.\n\n## Para la próxima\n1. Empieza por el lado contrario al jungla rival y rastrea su ruta.\n2. Prioriza Filo fantasmal de Youmuu antes de la segunda vuelta.' };
        case 'patchNotes': {
          // Notas ya estructuradas, con la forma de patchnotes.js (sin IA). Datos reales del 26.21, recortados
          await delay(700);
          const img = 'https://ddragon.leagueoflegends.com/cdn/16.18.1/img/';
          const c = (stat, before, after, dir, good) => ({ stat, before, after, text: `${stat}: ${before} ⇒ ${after}.`, dir, good });
          const t = (stat, text, dir = 'change') => ({ stat, before: null, after: null, text: stat ? `${stat}: ${text}` : text, dir, good: null });
          const g = (title, icon, ...changes) => ({ title, icon: icon ? img + icon : null, changes });
          const champ = (id, name, championId, key, verdict, summary, context, groups, mine = false) =>
            ({ id, name, championId, icon: `${img}champion/${key}.png`, context, verdict, summary, groups, ...(mine ? { mine } : {}) });
          const item = (id, name, itemId, verdict, summary, context, changes) => ({ id, name, itemId, context, verdict, summary, groups: [g('', null, ...changes)] });
          return {
            version: '26.21', url: 'https://www.leagueoflegends.com/es-es/news/game-updates/league-of-legends-patch-26-21-notes',
            title: 'Notas de la versión 26.21', date: '2026-10-20T18:00:00.000Z', description: '', updatedAt: Date.now(), offline: false,
            intro: 'El Mundial ha comenzado, pero la vida sigue para el resto de mortales que no somos profesionales, así que ahí va la versión 26.21. Esta versión viene cargadita, con cambios a algunos tanques como Rammus, Sion y Nunu y Willump, así como a muchos otros campeones de distintos roles que han estado dominando. Por último, hemos visto que Grebas codiciosas y Soberbia tienen un rendimiento demasiado bueno en el caso de los personajes a distancia, así que vamos a debilitarlas un poco.',
            authors: ['Austin "Riot wroadie" Wright', 'Erika "Riot Cashmiir" Haas', 'Steven "Riot sternest" Earnest'],
            highlights: { image: null, text: ['Ekko True Damage - Know My Name de prestigio y otros aspectos estarán disponibles el 21 de octubre de 2026.'] },
            sections: [
              { id: 'midpatch-updates', title: 'Actualizaciones de mitad de versión', kind: 'champions', context: '', entries: [
                champ('midpatch-updates-0', 'Varus', 110, 'Varus', 'buff', 'Daño mínimo de la Q: 50 - 230 → 50 - 250', 'Hemos introducido un error grave en su Q que ha provocado que ya no inflija daño reducido a los subsiguientes objetivos. Estamos corrigiendo ese error y lo compensaremos con una mejora.', [
                  g('', null, c('DA y PH adicionales de la pasiva por asesinato', '1,1 por cada 10 % de velocidad de ataque', '1,4 por cada 10 % de velocidad de ataque', 'up', true), c('Daño mínimo de la Q', '50 - 230', '50 - 250', 'up', true)),
                ]),
              ] },
              { id: 'replay-download-limits', title: 'Límites de descargas de repeticiones', kind: 'other', context: 'A partir de la versión 26.21, las descargas de repeticiones estarán limitadas a 10 por hora. Seguiréis pudiendo descargar vuestras propias repeticiones, así como las de vuestros colegas y las de otros jugadores.', entries: [] },
              { id: 'champions', title: 'Campeones', kind: 'champions', context: '', entries: [
                champ('champions-0', 'Azir', 268, 'Azir', 'buff', 'Crecimiento de maná: 40/nivel → 50/nivel', 'Vamos a mejorar su crecimiento del maná para que pueda usar sus habilidades con más libertad y dominar la calle.', [
                  g('Estadísticas básicas', null, c('Crecimiento de maná', '40/nivel', '50/nivel', 'up', true)),
                ]),
                champ('champions-1', 'Caitlyn', 51, 'Caitlyn', 'nerf', 'Pasiva · Daño: 60-100 % del DA → 60-80 % del DA · Q · Daño básico: 50/90/130/170/210 → 50/95/140/185/230', 'Caitlyn lleva meses con un porcentaje de elección y bloqueo muy alto, así que ya va tocando aplicarle una debilitación. Vamos a transferir parte del poder de los disparos a la cabeza al daño de su Q en la fase inicial de la partida.', [
                  g('Pasiva - Disparo a la cabeza', 'passive/Caitlyn_Headshot.png', c('Daño', '60-100 % del DA (+1 % de DA por cada 1 % de probabilidad de crítico)', '60-80 % del DA (+0,8 % de DA por cada 1 % de probabilidad de crítico)', 'down', false)),
                  g('Q - Pacificadora de Piltover', 'spell/CaitlynQ.png', c('Daño básico', '50/90/130/170/210', '50/95/140/185/230', 'up', true)),
                ]),
                champ('champions-2', 'Darius', 122, 'Darius', 'buff', 'Q · Enfriamiento: 9/8/7/6/5 s → 9/8/7/6/4 s', 'Como tiene algo de margen de poder, vamos a darle un empujoncito para que pueda girar el hacha más a menudo en los combates prolongados.', [
                  g('Q - Diezmar', 'spell/DariusCleave.png', c('Enfriamiento', '9/8/7/6/5 s', '9/8/7/6/4 s', 'down', true)),
                ]),
                champ('champions-3', 'Jinx', 222, 'Jinx', 'nerf', 'Daño de ataque: 59 + 3,25/nivel → 59 + 3/nivel · Vida: 630 + 105/nivel → 610 + 105/nivel', 'Jinx se ha apoderado del metajuego. Vamos a ponerla en vereda para que le cueste más empezar a sacar ventaja.', [
                  g('Estadísticas básicas', null, c('Daño de ataque', '59 + 3,25/nivel', '59 + 3/nivel', 'down', false), c('Vida', '630 + 105/nivel', '610 + 105/nivel', 'down', false)),
                ]),
                champ('champions-4', 'Lee Sin', 64, 'LeeSin', 'nerf', 'W · Enfriamiento: 7 s → 8 s · R · Daño de la patada: 175/400/625 → 150/350/550', 'Su poder se ha desmadrado, así que vamos a aplicarle una debilitación a su enfriamiento, además de una corrección de error menor a su E y otra pequeña debilitación al daño de Ira del dragón (R).', [
                  g('W - Salvaguarda', 'spell/LeeSinWOne.png', c('Enfriamiento', '7 s', '8 s', 'up', false)),
                  g('E - Tempestad', 'spell/LeeSinEOne.png', t('Corrección de error', 'Ya no revela a los enemigos invisibles si entran en sigilo tras ser alcanzados por Tempestad.')),
                  g('R - Ira del dragón', 'spell/LeeSinR.png', c('Daño de la patada', '175/400/625 (+200 % del DA adicional)', '150/350/550 (+200 % del DA adicional)', 'down', false), c('Daño de colisión', '175/400/625 (+200 % del DA adicional)', '150/350/550 (+200 % del DA adicional)', 'down', false)),
                ], true),
                champ('champions-5', 'Locke', 805, 'Locke', 'nerf', 'Crecimiento de maná: 70 → 60 · W · Coste de maná: 50/55/60/65/70 → 60/65/70/75/80', 'Sus generosísimas reservas de maná y su habilidad para ignorar el hostigamiento destacan demasiado. También vamos a mejorar ligeramente su daño progresivo.', [
                  g('Q - Clavos rituales', 'spell/LockeQ.png', c('Recuperación de cargas no utilizadas', '20-35 % del maná', '10-40 % del maná', 'change', null)),
                  g('Estadísticas básicas', null, c('Crecimiento de maná', '70', '60', 'down', false)),
                  g('W - Ignición de alma', 'spell/LockeW.png', c('Coste de maná', '50/55/60/65/70', '60/65/70/75/80', 'up', false)),
                  g('E - Afán ceniciento', 'spell/LockeE.png', c('Daño de teleportación', '40/50/60/70/80 (+40 % del PH)', '40/55/70/85/100 (+40 % del PH)', 'up', true)),
                ]),
                champ('champions-22', 'Xin Zhao', 5, 'XinZhao', 'adjust', 'Q · Daño por golpe: 15/30/45/60/75 (+40 % del DA adicional) → 15/30/45/60/75 (+45 % del DA adicional)', 'Vamos a darle algo más de daño en la Q y a cambiar cómo progresa su E con la velocidad de ataque.', [
                  g('Q - Golpe de tres garras', 'spell/XinZhaoQ.png', c('Daño por golpe', '15/30/45/60/75 (+40 % del DA adicional)', '15/30/45/60/75 (+45 % del DA adicional)', 'up', true)),
                  g('E - Carga audaz', 'spell/XinZhaoE.png', c('Progresión de velocidad de ataque', '1 % por cada 5 % de velocidad de ataque adicional', '1 % por cada 4 % de velocidad de ataque adicional', 'down', false)),
                ], true),
                champ('champions-24', 'Zyra', 143, 'Zyra', 'buff', 'W · Enfriamiento de munición de semillas: 18/16/14/12/10 s → 16/14,5/13/11,5/10 s', 'Haremos que Zyra tenga aún más buena mano con las plantas.', [
                  g('W - Crecimiento desenfrenado', 'spell/ZyraW.png', c('Enfriamiento de munición de semillas', '18/16/14/12/10 s', '16/14,5/13/11,5/10 s', 'down', true)),
                ]),
              ] },
              { id: 'items', title: 'Objetos', kind: 'items', context: '', entries: [
                item('items-0', 'Quiebrabastiones', 2520, 'nerf', 'Letalidad: 22 → 18 · Duración de Sabotaje: 90 s → Infinito', 'Vamos a debilitar ese poder genérico con una mejora de calidad para que siga siendo un objeto satisfactorio dentro de su nicho.', [
                  c('Letalidad', '22', '18', 'down', false), c('Daño de Carga moldeada', '50 cuerpo a cuerpo / 25 a distancia', '40 cuerpo a cuerpo / 20 a distancia', 'down', false), c('Duración de Sabotaje', '90 s', 'Infinito', 'up', true),
                ]),
                item('items-1', 'Corazón del alba', 6621, 'buff', 'Poder de habilidad por cada 100 % de regeneración de maná básica: 10 → 15', 'Vamos a mejorar su valor de PH para que no dependa exclusivamente de las curaciones y los escudos.', [
                  c('Poder de habilidad por cada 100 % de regeneración de maná básica', '10', '15', 'up', true),
                ]),
                item('items-2', 'Grebas codiciosas', 3008, 'nerf', 'Coste total: 1000 de oro → 1100 de oro', 'Vamos a aumentar su coste para retrasar las adquisiciones tempranas.', [c('Coste total', '1000 de oro', '1100 de oro', 'up', false)]),
                item('items-3', 'Soberbia', 6697, 'adjust', 'Daño de ataque adicional base: 12 → 15 cuerpo a cuerpo / 10 a distancia', 'Queremos animar a los campeones cuerpo a cuerpo a que se lo equipen y disuadir a los campeones a distancia de que lo hagan.', [
                  c('Daño de ataque adicional base', '12', '15 cuerpo a cuerpo / 10 a distancia', 'up', true), c('Daño de ataque adicional por acumulación', '3', '3 cuerpo a cuerpo / 2 a distancia', 'down', false),
                ]),
              ] },
              { id: 'aram--mayhem', title: 'ARAM: Caos', kind: 'modes', context: 'Os presentamos el último lanzamiento de ARAM: Caos, Camino al estrellato. Cada partida de Caos contará con una actuación estelar que le dará un giro de tuerca a las reglas.', entries: [
                { id: 'aram--mayhem-1', name: 'Barrera azul (plateado)', category: 'Nuevos aumentos', context: '', verdict: 'new', summary: 'Otorga un escudo cada vez que lancéis una habilidad según su coste de maná.', groups: [g('', null, t(null, 'Otorga un escudo cada vez que lancéis una habilidad según su coste de maná.'))] },
                { id: 'aram--mayhem-36', name: 'Aumentos eliminados', category: null, context: '', verdict: 'adjust', summary: 'Interés explosivo', groups: [g('', null, t(null, 'Interés explosivo'), t(null, 'Críticos y conjuros'), t(null, 'Misil crítico'))] },
              ] },
              { id: 'bugfixes-and-qol-changes', title: 'Corrección de errores y mejoras de calidad', kind: 'other', context: '', entries: [
                { id: 'bugfixes-and-qol-changes-0', name: 'Corrección de errores y mejoras de calidad', context: '', verdict: 'adjust', summary: 'Se ha corregido un error que provocaba que la Q de Zaahen no se completase si revivía en mitad del ataque.', groups: [g('', null,
                  t(null, 'Se ha corregido un error que provocaba que la Q de Zaahen no se completase si revivía en mitad del ataque.'),
                  t(null, 'Hemos corregido un error que provocaba que el temporizador de enfriamiento de Hidra titánica no se mostrase tras su uso.'))] },
              ] },
            ],
            forYou: {
              role: 'jungle', roleName: 'jungla',
              champions: [
                { championId: 35, name: 'Shaco', games: 24, winRate: 0.58, changed: false, verdict: null, refs: [] },
                { championId: 102, name: 'Shyvana', games: 11, winRate: 0.55, changed: false, verdict: null, refs: [] },
                { championId: 64, name: 'Lee Sin', games: 6, winRate: 0.5, changed: true, verdict: 'nerf', refs: [{ sectionId: 'champions', entryId: 'champions-4', verdict: 'nerf' }] },
                { championId: 5, name: 'Xin Zhao', games: 3, winRate: 0.67, changed: true, verdict: 'adjust', refs: [{ sectionId: 'champions', entryId: 'champions-22', verdict: 'adjust' }] },
              ],
            },
          };
        }
        case 'askDraftCoach':
          await delay(1600);
          if (!db.draft.active) throw new Error('No estás en la selección de campeones');
          return { text: '## Baneo\n- **Lee Sin**: el jungla rival que más castiga a Shaco en la invasión temprana. Alternativa: Rengar.\n\n## Pick\n- **Shaco**: tu campeón más jugado (58% en 24) y el rival no tiene control de visión fuerte.\n- **Viego**: escala mejor si la partida se alarga y tu equipo ya tiene daño mágico.\n\n## Plan\n- Fuerza temprana: busca el gank a nivel 3 en la línea superior.\n- Vigila al Ahri rival: tiene presión de roam a nivel 6.' };
        case 'championStats': {
          // Explorador de campeon: datos de ejemplo con la forma de champstats.js
          await delay(300);
          const role = args.role || 'jungle';
          const b = buildFor(args.championId);
          const c = (championId, winRate, games) => ({ championId, winRate, games });
          return {
            championId: args.championId, role, damageType: 'BOTH',
            stats: { winRate: 0.51, pickRate: 0.06, banRate: 0.17, tier: 2, rank: 8 },
            counters: { strong: [c(126, 0.6, 223), c(254, 0.57, 556), c(80, 0.57, 139)], weak: [c(133, 0.43, 190), c(102, 0.44, 612), c(163, 0.46, 274)] },
            synergies: Object.fromEntries(['top', 'jungle', 'mid', 'adc', 'support'].filter(r => r !== role)
              .map((r, i) => [r, [c([39, 64, 61, 222, 412][i], 0.55, 147), c([266, 254, 103, 51, 89][i], 0.54, 156), c([41, 121, 7, 498, 53][i], 0.53, 178)]])),
            build: { ...b, role, games: 12480, winRate: 0.52 },
            options: b.options, vs: args.vs || 64, vsManual: !!args.vs,
            otp: { state: 'downloading', queuePos: 1, mains: [{ name: 'PinkWard#Laugh', region: 'NA', fetched: 210, season: 894, onChamp: 180 }, { name: 'Shaco Mid Lane#EUW', region: 'EUW', fetched: 0, season: 631, onChamp: 0 }], games: 4, seasonGames: 180, minGames: 6, running: true },
            matchup: { vs: args.vs || 64, winRate: args.vs ? 0.47 : 0.52, games: 1840, source: 'U.GG' },
            // Segunda fuente (U.GG): piedras angulares mas jugadas y una build por cada una
            ugg: {
              patch: '16_21', games: 35538, winRate: 0.5,
              keystones: [
                { keystone: 9923, subStyle: 8000, games: 17646, winRate: 0.49 }, { keystone: 8229, subStyle: 8000, games: 9542, winRate: 0.54 },
                { keystone: 8128, subStyle: 8200, games: 3732, winRate: 0.49 }, { keystone: 8230, subStyle: 8400, games: 2050, winRate: 0.51 },
              ],
              options: b.options.filter(o => o.sources.includes('ugg')),
              spells: [11, 14], starter: [1102, 2003], skillOrder: b.skillOrder, skillPriority: b.skillPriority,
            },
          };
        }
        case 'testMatchup': {
          // Prueba de "Tu enfrentamiento": el ejemplo de la seleccion con el campeon y rival pedidos
          await delay(400);
          const ex = makeDraft('locked').matchupCheck;
          return { ...ex, me: args.championId, vs: args.vs, role: args.role || ex.role };
        }
        case 'chooseBuild': {
          const d = db.draft, b = d.build;
          d.choice = args.index;
          const o = b.options[args.index];
          Object.assign(b, { runes: o.runes, core: o.core, boots: o.boots, context: o.context, spells: o.spells, starter: o.starter, skillOrder: o.skillOrder, skillPriority: o.skillPriority });
          emit('draft');
          return true;
        }
        case 'hoverChampion': {
          const d = db.draft;
          if (!d.active) throw new Error('No estás en la selección');
          d.myChampionId = args.championId;
          d.allies.find(a => a.isMe).championId = args.championId;
          d.build = null; d.loading = true;
          emit('draft');
          await delay(400);
          d.build = buildFor(args.championId); d.loading = false;
          setState({ status: { text: `Selección de campeones\n${champions.all.find(c => c.id === args.championId)?.name} preseleccionado`, color: 'green' } });
          emit('draft');
          return true;
        }
        case 'importBuild':
          await delay(700);
          db.draft.imported = { runes: 'ok', spells: 'ok', items: 'ok', message: 'Runas, hechizos y objetos importados' };
          emit('draft');
          return true;
        case 'importItems':
          await delay(500);
          db.draft.imported = { runes: null, spells: null, items: 'ok', message: 'Importado: objetos (tienda: «LoL Coach: Shaco»)' };
          emit('draft');
          return clone(db.draft.imported);
        case 'testOverlay': {
          // Igual que el proceso principal: datos de ejemplo durante 10 s y luego el estado real
          const real = clone(db.live);
          emit('live', { ...makeLive(754), notify: { id: ++notifyId, text: 'Dragón en 60 s', kind: 'objective' } });
          db.live = live;
          setTimeout(() => emit('live', real), 10000);
          return true;
        }
        case 'checkUpdate': {
          // Simula una version nueva: descarga en 2 s y queda lista
          setState({ update: { version: '1.2.4', state: 'downloading', next: '1.2.5', percent: 0 } });
          for (const p of [35, 70, 100]) { await delay(600); setState({ update: { ...db.state.update, percent: p } }); }
          setState({ update: { version: '1.2.4', state: 'ready', next: '1.2.5', percent: 100 } });
          return true;
        }
        case 'installUpdate':
          await delay(800);
          setState({ update: { version: '1.2.5', state: 'latest', next: null, percent: null } });
          return true;
        case 'lockChampion': {
          const d = db.draft;
          if (!d.active) throw new Error('No estás en la selección de campeones');
          if (d.turn !== 'pick') throw new Error('Todavía no es tu turno de pick');
          await delay(1500);
          d.myChampionId = args.championId;
          d.allies.find(a => a.isMe).championId = args.championId;
          d.locked = true; d.turn = null;
          emit('draft');
          return true;
        }
        case 'createLobby': {
          const q = MOCK_QUEUES.find(x => x.id === args.queueId);
          setState({ phase: 'Lobby', lobby: { ...db.state.lobby, invitations: [], queues: MOCK_QUEUES, queueId: q.id, queue: q.name, isLeader: true, members: 1,
            canSearch: ![420, 440, 400].includes(q.id), positions: [420, 440, 400].includes(q.id) ? { first: 'UNSELECTED', second: 'UNSELECTED' } : null, searching: null } });
          return true;
        }
        case 'setPositions': {
          const positions = { first: args.first, second: args.first === 'FILL' ? 'UNSELECTED' : args.second };
          setState({ lobby: { ...db.state.lobby, positions, canSearch: positions.first === 'FILL' || (positions.first !== 'UNSELECTED' && positions.second !== 'UNSELECTED') } });
          return true;
        }
        default: throw new Error(`Acción desconocida: ${name}`);
      }
    },
    window(cmd) { console.log('[mock] ventana:', cmd); },
  };

  window.__mock = { setPhase: p => PHASES[p]?.(), db, phases: Object.keys(PHASES) };

  // En el overlay, simular directamente una partida en curso
  if (/overlay\.html$/.test(location.pathname)) {
    db.state.phase = 'InProgress';
    Object.assign(live, makeLive());
    startLive();
  }

  // ---------- Panel de depuracion (F9) ----------
  function togglePanel() {
    let p = document.getElementById('mockPanel');
    if (p) { p.remove(); return; }
    p = document.createElement('div');
    p.id = 'mockPanel';
    p.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2000;display:flex;flex-wrap:wrap;gap:4px;max-width:420px;padding:8px;background:#010A13;border:1px solid #C8AA6E;font:12px sans-serif;box-shadow:0 6px 20px #000';
    const title = document.createElement('div');
    title.textContent = 'Simular (mock):';
    title.style.cssText = 'width:100%;color:#C8AA6E;margin-bottom:2px';
    p.appendChild(title);
    for (const name of Object.keys(PHASES)) {
      const b = document.createElement('button');
      b.textContent = name;
      b.style.cssText = 'background:#1E2328;color:#F0E6D2;border:1px solid #785A28;padding:3px 7px;cursor:pointer';
      b.onclick = () => PHASES[name]();
      p.appendChild(b);
    }
    document.body.appendChild(p);
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'F9' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd')) togglePanel();
  });
})();
