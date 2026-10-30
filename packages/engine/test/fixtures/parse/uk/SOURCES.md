# Where the Ukrainian fixtures come from

Each fixture is one sentence, parsed by Stanza's Ukrainian model (UD
Ukrainian-IU) with the dictionary check on its lemmas
(`services/parser/src/parser_service/lemmas.py`). This file records where
the Ukrainian text comes from, because `npm run fixtures:write` rewrites the
fixtures' own headers.

- **Tatoeba #N**: a Ukrainian sentence from tatoeba.org, CC BY 2.0 FR, by its
  sentence number. Where Tatoeba links it to an Interslavic sentence, that
  translation is the expected output's reference.
- **UDHR**: Article 1 of the Universal Declaration of Human Rights, the
  Ukrainian text of the Unicode UDHR project.
- **Ohienko**: the Bible in Ivan Ohienko's translation (api.getbible.net,
  `ukrogienko`), stress marks removed.
- **written**: the Ukrainian counterpart of a Russian fixture with no attested
  Ukrainian sentence. Every word was checked against simplemma's Ukrainian
  form tables: all 334 are listed except three names and "приготована", the
  regular feminine of the listed "приготований" (attested on Tatoeba as
  "приготованим", #11585448).

Where the published text has Latin look-alike letters, the fixture holds the
repaired text the parser receives (see `rules/src/mixed-script.ts`).

| Fixture | Ukrainian | Source |
|---|---|---|
| `gold/g01-uk` | Батько купив книгу? | written: mirror of gold g01-ru |
| `gold/g02-uk` | Яку книгу купив батько? | written: mirror of gold g02-ru |
| `gold/g03-uk` | Де батько купив ту книгу? | written: mirror of gold g03-ru |
| `gold/g04-uk` | Яка жінка любить того чоловіка? | written: mirror of gold g04-ru |
| `gold/g05-uk` | Я не хочу йти в кіно. | written: mirror of gold g05-ru |
| `gold/g07-uk` | Я ніколи не їм шоколад. | written: mirror of gold g07-ru |
| `gold/g08-uk` | Ніхто не прийшов на вечірку. | Tatoeba #6782953 |
| `gold/g17-uk` | Мій брат не їсть хліб. | written: mirror of gold g17-ru |
| `gold/g18-uk` | Кіт спить під столом. | written: mirror of gold g18-ru |
| `gold/g19-uk` | Кіт побіг під стіл. | Tatoeba #11105487 |
| `gold/g22-uk` | Я мию свою машину. | written: mirror of gold g22-ru |
| `gold/g23-uk` | Я мию себе. | written: mirror of gold g23-ru |
| `gold/g27-uk` | п'ять будинків | written: mirror of gold g27-ru |
| `gold/g28-uk` | два студенти | written: mirror of gold g28-ru |
| `gold/g50-uk` | Всі люди народжуються вільними і рівними у своїй гідності та правах. | UDHR Art. 1, Ukrainian text of the Unicode UDHR project (unpkg.com/udhr@6.0.0/declaration/ukr.html) |
| `gold/g51-uk` | Вони наділені розумом і совістю і повинні діяти у відношенні один до одного в дусі братерства. | UDHR Art. 1, Ukrainian text of the Unicode UDHR project (unpkg.com/udhr@6.0.0/declaration/ukr.html) |
| `uk/babel-3-intro` | І сказали вони один одному: | Ohienko, Gen 11:3 (api.getbible.net ukrogienko), first sentence, stress marks and quotation marks removed; the words before the speech, which the parser makes a sentence of its own |
| `uk/babel-3` | Ану, наробімо цегли, і добре її випалімо! | Ohienko, Gen 11:3 (api.getbible.net ukrogienko), first sentence, stress marks and quotation marks removed; the speech, which the parser makes a sentence of its own |
| `uk/babel-4-intro` | І сказали вони: | Ohienko, Gen 11:4, first sentence, stress marks and quotation marks removed; the words before the speech, which the parser makes a sentence of its own |
| `uk/babel-4` | Тож місто збудуймо собі, та башту, а вершина її аж до неба. | Ohienko, Gen 11:4, first sentence, stress marks and quotation marks removed; the speech, which the parser makes a sentence of its own |
| `uk/babel-6-intro` | І промовив Господь: | Ohienko, Gen 11:6, first sentence, stress marks and quotation marks removed; the words before the speech, which the parser makes a sentence of its own |
| `uk/babel-6` | Один це народ, і мова одна для всіх них, а це ось початок їх праці. | Ohienko, Gen 11:6, first sentence, stress marks and quotation marks removed; the speech, which the parser makes a sentence of its own |
| `uk/babel-7` | Тож зійдімо, і змішаймо там їхні мови, щоб не розуміли вони мови один одного. | Ohienko, Gen 11:7, stress marks and quotation marks removed |
| `uk/prosty-nam-dovhy` | І прости нам довги наші, як і ми прощаємо винуватцям нашим. | Ohienko, Mt 6:12, stress marks removed |
| `uk/nehaj-bude-volja` | Нехай буде воля Твоя, як на небі, так і на землі. | Ohienko, Mt 6:10, without the first clause |
| `uk/ne-vvedy-nas` | I не введи нас у випробовування, але визволи нас від лукавого. | Ohienko, Mt 6:13 as published, with its Latin "I"; stress marks removed |
| `uk/bojusja-sobaky` | Я боюся собаки. | written: mirror of ru/bojus-sobaki |
| `uk/duzhe-djakuju` | Дуже дякую. | Tatoeba #4918189 |
| `uk/budu-chytaty` | Я буду читати книгу. | written: mirror of ru/budu-chitat |
| `uk/chytatymu` | Я читатиму книгу. | written: the synthetic future of читати (Wiktionary conjugation table) |
| `uk/chytaje-shvydshe` | Вона читає швидше за мене. | written: mirror of ru/chitaet-bystree |
| `uk/chytaje-pyshe` | Він читає; вона пише. | written: mirror of ru/chitaet-pishet |
| `uk/chytajuchy-knyhu` | Читаючи книгу, вона усміхалася. | written: mirror of ru/chitaja-knigu |
| `uk/shcho-ce` | Що це? | Tatoeba #466939 |
| `uk/divchynka-bachyt` | Дівчинка бачить нового хлопчика. | written: mirror of ru/devochka-vidit-malchika |
| `uk/dobryj-ranok` | Добрий ранок! | Tatoeba #3841523 |
| `uk/povynni-pity` | Ми повинні піти до півночі. | written: mirror of ru/dolzhny-ujti |
| `uk/budynok-bilshyj-za` | Цей будинок більший за той будинок. | written: mirror of ru/dom-bolshe-togo |
| `uk/budynok-bilshyj-vid` | Цей будинок більший від того будинку. | written: mirror of ru/dom-bolshe-togo |
| `uk/bilshyj-nizh` | Цей будинок більший, ніж той. | written: comparison with ніж |
| `uk/budynok-zhoriv` | Будинок згорів. | written: mirror of ru/dom-sgorel |
| `uk/budynok-buduje-sja` | Будинок будується робітниками. | written: mirror of ru/dom-stroitsja |
| `uk/budynok-zbudovano` | Будинок збудовано. | written: the impersonal -но/-то form |
| `uk/dva-braty` | У мене два брати й одна сестра. | written: mirror of ru/dva-brata |
| `uk/je-odna-sestra` | У мене є одна сестра. | Tatoeba #492962 |
| `uk/maju-bahato-knyzhok` | Я маю багато книжок. | Tatoeba #6537932 |
| `uk/izha-bula-pryhotovana` | Їжа була приготована моєю бабусею. | written: mirror of ru/eda-byla-prigotovlena |
| `uk/jij-podobajetsja` | Їй подобається готувати. | written: mirror of ru/ej-nravitsja-gotovit |
| `uk/jakby-ja-znav` | Якби я знав, я б прийшов. | written: mirror of ru/esli-by-ja-znal |
| `uk/ce-maje-sens` | Це має сенс. | written: mirror of ru/eto-imeet-smysl |
| `uk/cej-podarunok` | Цей подарунок для тебе. | Tatoeba #6890909 |
| `uk/hovoryv-pro-jes` | Він говорив про Європейський союз. | written: mirror of ru/govoril-o-evropejskom-soyuze |
| `uk/hotiv-by-chytaty` | Я хотів би читати. | written: mirror of ru/hotel-by-chitat |
| `uk/hocha-bulo-pizno` | Хоча було вже пізно, ми вирішили погуляти. | written: mirror of ru/hotja-bylo-pozdno |
| `uk/hochu-kupyty` | Я хочу купити машину. | written: mirror of ru/ja-hochu-kupit-mashinu |
| `uk/prochytaju-knyhu` | Я прочитаю книгу. | written: mirror of ru/ja-prochitaju-knigu |
| `uk/chotyrjoh-ditej` | Я бачу чотирьох дітей. | written: mirror of ru/ja-vizhu-chetyreh-detej |
| `uk/jiji-bachu` | Я її бачу. | Tatoeba #9850481 |
| `uk/vstaju-o-somij` | Я встаю о сьомій. | written: mirror of ru/ja-vstaju-v-sem |
| `uk/zaplatyv-za-kvytky` | Я заплатив за квитки. | Tatoeba #5926073 |
| `uk/na-zhal` | На жаль, я не можу. | written: mirror of ru/k-sozhaleniju |
| `uk/jak-spravy` | Як справи? | Tatoeba #723987 |
| `uk/de-stancija` | Де станція? | written: mirror of ru/kde-stancija |
| `uk/de-vokzal` | Де вокзал? | Tatoeba #6396498 |
| `uk/knyha-chytajetsja` | Книга читається легко. | written: mirror of ru/kniga-chitaetsja |
| `uk/knyha-jaku` | Книга, яку я читаю, цікава. | written: mirror of ru/kniga-kotoruju |
| `uk/do-rechi` | До речі, де вокзал? | written: mirror of ru/kstati-gde-vokzal |
| `uk/llje-jak-z-vidra` | Дощ ллє як з відра. | Tatoeba #3277960 |
| `uk/hlopchyk-daje` | Хлопчик дає дівчинці нову книгу. | written: mirror of ru/malchik-daet-knigu |
| `uk/meni-holodno` | Мені холодно. | Tatoeba #2103026 |
| `uk/meni-podobajetsja` | Мені подобається ця книга. | written: mirror of ru/mne-nravitsja |
| `uk/my-studenty` | Ми студенти. | Tatoeba #480447 |
| `uk/zustrilysja` | Ми зустрілися на вокзалі. | written: mirror of ru/my-vstretilis-na-vokzale |
| `uk/nema-za-shcho` | Нема за що. | Tatoeba #379408 |
| `uk/vin-likar` | Він лікар. | Tatoeba #1772849 |
| `uk/muchyt-sobaku` | Він мучить собаку. | written: mirror of ru/on-muchit-sobaku |
| `uk/muchytsja` | Він мучиться. | written: mirror of ru/on-muchitsja |
| `uk/na-roboti` | Він на роботі. | written: mirror of ru/on-na-rabote |
| `uk/zalyshyvsja-vdoma` | Він залишився вдома. | written: mirror of ru/on-ostalsja-doma |
| `uk/vidpovidaje-za-projekt` | Він відповідає за проєкт. | written: mirror of ru/on-otvechaet-za-proekt |
| `uk/uhvalyv-rishennja` | Він ухвалив рішення. | written: mirror of ru/on-prinjal-reshenie |
| `uk/vona-v-shkoli` | Вона в школі. | written: mirror of ru/ona-v-shkole |
| `uk/vony-zhyvut` | Вони живуть тут десять років. | written: mirror of ru/oni-zhivut (Tatoeba #1569511 has the typo "туть") |
| `uk/vidchyny-vikno` | Відчини вікно. | written: mirror of ru/otkroj-okno |
| `uk/vidchynit-vikno` | Відчиніть вікно. | written: mirror of ru/otkrojte-okno |
| `uk/pjat-brativ` | У мене п'ять братів. | written: mirror of ru/pjat-bratjev |
| `uk/potjah-vidhodyt` | Потяг відходить о дев'ятій годині. | written: mirror of ru/poezd-uhodit-v-devjat |
| `uk/pojizdka-tryvala` | Поїздка тривала три дні. | written: mirror of ru/poezdka-dlilas-tri-dnja |
| `uk/prochytavshy-lyst` | Прочитавши лист, вона довго дивилася у вікно. | written: mirror of ru/prochitav-pismo |
| `uk/rustam-shchaslyvyj` | Рустам щасливий. | written: mirror of ru/rustam-schastliv |
| `uk/z-dnem-narodzhennja` | З днем народження! | Tatoeba #379378 |
| `uk/z-trjoma-knyhamy` | Я прийшов з трьома книгами. | written: mirror of ru/s-tremja-knigami |
| `uk/najkrashchyj-student` | Він найкращий студент. | written: mirror of ru/samyj-luchshij |
| `uk/najbilsh-cikava` | Це найбільш цікава книга. | written: the analytic superlative with найбільш |
| `uk/skazala-shcho` | Вона сказала мені, що вона втомилася. | written: mirror of ru/skazala-chto |
| `uk/zbory-vidbulysja` | Збори відбулися вчора. | written: mirror of ru/sobranie-sostojalos |
| `uk/djakuju-za-dopomohu` | Дякую за допомогу. | Tatoeba #6541566 |
| `uk/djakuju` | Дякую! | Tatoeba #379451 |
| `uk/stala-likarem` | Вона стала лікарем. | written: mirror of ru/stala-vrachom |
| `uk/starshyj-za-mene` | Він старший за мене на два роки. | written: mirror of ru/starshe-menja |
| `uk/buv-pobudovanyj` | Будинок був побудований. | written: mirror of ru/synthetic-byt-aux-participle |
| `uk/budu-z-toboju` | Я буду з тобою. | Tatoeba #5843018 |
| `uk/bulo-holodno` | Сьогодні було дуже холодно. | written: mirror of ru/tatoeba-bylo-holodno |
| `uk/harna-taryna` | Це гарна тварина. | written: mirror of ru/tatoeba-krasivoe-zhivotnoe |
| `uk/ne-idioty` | Ми не ідіоти. | Tatoeba #5975772 |
| `uk/starshyj-za-toma` | Я набагато старший за Тома. | written: mirror of ru/tatoeba-starshe-toma |
| `uk/v-indiji-korovy` | В Індії корови — священні тварини. | written: mirror of ru/tatoeba-v-indii-korovy |
| `uk/u-vsomu-pravyj` | Том був у всьому правий. | written: mirror of ru/tatoeba-vo-vsem-prav |
| `uk/try-knyhy` | Я бачу три книги. | written: mirror of ru/tri-knigi |
| `uk/ty-chytajesh` | Ти читаєш книгу. | written: mirror of ru/ty-chitaesh |
| `uk/vy-chytajete` | Ви читаєте книгу. | written: mirror of ru/vy-chitaete |
| `uk/nemaje-brata` | У мене немає брата. | written: mirror of ru/u-menja-net-brata |
| `uk/zreshtoju` | Зрештою він прийшов. | written: mirror of ru/v-konce-koncov |
| `uk/vzjav-joho-knyhu` | Він взяв його книгу. | written: mirror of ru/vzjal-ego-knigu |
| `uk/sopolucheni-shtaty` | Вона живе в Сполучених Штатах. | written: mirror of ru/zhivet-v-soedinennyh-shtatah (Tatoeba #6886561 has the first person) |
| `uk/pivnichna-makedonija` | Я живу в Північній Македонії. | written: mirror of ru/zhivu-v-severnoj-makedonii |
| `uk/zulfija-shchaslyva` | Зульфія щаслива. | written: mirror of ru/zulfija-schastliva |
| `uk/zulfija-spala` | Зульфія спала. | written: mirror of ru/zulfija-spala |
| `uk/hovorju-francuzkoju` | Я вільно говорю французькою. | Tatoeba #8049843 |
| `uk/jak-vas-zvaty` | Як вaс звати? | Tatoeba #3130581 (as published, with a Latin "a") |
| `uk/ja-jim-jabluko` | Я їм яблуко. | Tatoeba #1084429 |
| `uk/ja-kit` | Я кіт. | Tatoeba #5133318 |
| `uk/ty-gej` | Ти ґей. | Tatoeba #5144734 |
| `uk/boha-ne-isnuje` | Бога не існує. | Tatoeba #5197390 |
| `uk/budu-z-vamy` | Я буду з вами. | Tatoeba #5843019 |
| `uk/ja-z-tomom` | Я з Томом. | Tatoeba #5910448 |
| `uk/ce-buv-tom` | Це був Том? | Tatoeba #5946491 |
| `uk/de-mama` | Де мама? | Tatoeba #6476658 |
| `uk/my-kuzeny` | Ми кузени. | Tatoeba #6688694 |
| `uk/ty-budesh-zi-mnoju` | Ти будеш зі мною. | Tatoeba #6722268 |
| `uk/vy-budete-zi-mnoju` | Ви будете зі мною. | Tatoeba #6722274 |
| `uk/tom-mij-plemiannyk` | Том — мій племінник. | Tatoeba #6772828 |
| `uk/ty-ne-durnyj` | Ти не дурний. | Tatoeba #6798082 |
| `uk/ty-ne-durna` | Ти не дурна. | Tatoeba #6798083 |
| `uk/idiotske-zapytannja` | Це ідіотське запитання. | Tatoeba #6881515 |
| `uk/vony-nebahati` | Вони небагаті. | Tatoeba #6921379 |
| `uk/ja-kishka` | Я кішка. | Tatoeba #7715358 |
| `uk/chervonyj-kolir` | Червоний — це колір. | Tatoeba #7987418 |
| `uk/vona-z-nym` | Вона з ним. | Tatoeba #8796386 |
| `uk/zhyvemo-u-riznyh` | Ми живемо у різних всесвітах. | Tatoeba #9673533 |
| `uk/narodyvsja-v-izraji` | Я народився в Ізраїлі. | Tatoeba #10142908 |
| `uk/fashysty-zaboronjajut` | Фашисти забороняють книжки. | Tatoeba #11698247 |
| `uk/ce-mashyna` | Це машина. | Tatoeba #12825292 |
| `uk/hochesh-vaflju` | Хочеш вафлю? | Tatoeba #13351828 |
| `uk/perezhyv-vijnu` | Том пережив війну. | Tatoeba #13721644 |
| `uk/de-moja-voda` | Де моя вода? | Tatoeba #13788274 |
| `uk/zahysnyky-mista` | Вони захисники міста. | Tatoeba #13915542 |
| `uk/nenavydzhu-cholovikiv` | Я ненавиджу чоловіків. | Tatoeba #13959867 |
| `uk/vijna-ce-myr` | Війна — це мир. | Tatoeba #1422009 (first sentence) |
| `uk/ty-vtomyvsja` | Ти втомився? | Tatoeba #943808 |
| `uk/mozhesh-dopomohty` | Можеш мені допомогти? | Tatoeba #6551962 |
| `uk/ne-vidchynjaj-vikno` | Не відчиняй вікно. | Tatoeba #6784468 |
| `uk/prochytav-knyzhku` | Я прочитав книжку. | Tatoeba #6545761 |
| `uk/pomer-mynuloho-roku` | Він помер минулого року. | Tatoeba #5142820 |
| `uk/dopomozhit-meni` | Допоможіть мені! | Tatoeba #2085054 |
| `uk/ja-shchaslyvyj` | Я щасливий. | Tatoeba #926488 |
| `uk/vmiju-plavaty` | Я вмію плавати. | Tatoeba #5656703 |
| `uk/u-mene-bahato-knyzhok` | У мене багато книжок. | Tatoeba #6537931 |
| `uk/znaju-de-vin-zhyve` | Я знаю, де він живе. | Tatoeba #552796 |
| `uk/ljublju-chytaty` | Я люблю читати книжки. | Tatoeba #6025274 |
| `uk/zrobyv-pomylku` | Я зробив помилку. | Tatoeba #414789 |
| `uk/bachu-joho` | Я його бачу. | Tatoeba #8059042 |
| `uk/bachu-shchos` | Я щось бачу. | Tatoeba #6944816 |
| `uk/bachu-jih` | Я їх бачу. | Tatoeba #4907114 |
| `uk/bachu-tebe` | Я тебе бачу. | Tatoeba #8123988 |
| `uk/prokydajusja-rano` | Я прокидаюся рано. | Tatoeba #1605261 |
| `uk/mijusja` | Я миюсь. | Tatoeba #8829598 |
| `uk/u-velykomu-misti` | Ми живемо у великому місті. | Tatoeba #6788589 |
| `uk/zachyny-dveri` | Зачини двері, будь ласка. | Tatoeba #6030510 |
| `uk/do-zavtra` | До завтра! | Tatoeba #515158 |
| `uk/vona-chytaje-knyzhku` | Вона читає книжку. | Tatoeba #7975373 |
| `uk/pobachyla-sebe` | Вона побачила себе у дзеркалі. | Tatoeba #8117119 |
| `uk/skazhy-pravdu` | Скажи мені правду. | Tatoeba #739093 |
| `uk/obidaly-razom` | Ми обідали разом. | Tatoeba #5882366 |
| `uk/jaka-v-tebe-adresa` | Яка в тебе адреса? | Tatoeba #6675001 |
| `uk/jak-tebe-zvaty` | Як тебе звати? | Tatoeba #490520 |
| `uk/hto-ce` | Хто це? | Tatoeba #629778 |
| `uk/ty-majesh-raciju` | Ти маєш рацію. | Tatoeba #2426738 |
| `uk/viryu-v-boha` | Я вірю в Бога. | Tatoeba #468970 |
| `uk/jakby-ja-ce-znav` | Якби я це знав, я би туди пішов. | Tatoeba #496365 |
| `uk/pryjshov-shchob` | Я прийшов, щоб убити його. | Tatoeba #467994 |
| `uk/hochu-shchob` | Я хочу, щоб ти заспівав пісню. | Tatoeba #337513 |
| `uk/ne-robytymu` | Я не робитиму цього з тобою. | Tatoeba #6087218 |
| `uk/krashche-nizh-ja` | Том краще грає в шахи, ніж я. | Tatoeba #1640120 |
| `uk/mist-zbudovano` | Міст було збудовано римлянами. | Tatoeba #624401 |
| `uk/knyhu-napysano` | Книгу написано англійською. | Tatoeba #916139 |
| `uk/tome-shcho-hochesh` | Томе, що ти хочеш на вечерю? | Tatoeba #1612837 |
| `uk/dobranich-mamo` | Добраніч, мамо. | Tatoeba #399617 |
| `uk/ty-starshyj-za-mene` | Ти старший за мене. | Tatoeba #5862299 |
| `uk/snidaju-o-somij` | Я снідаю о сьомій. | Tatoeba #922102 |
| `uk/vyvchaju-anhlijsku` | Я вивчаю англійську. | Tatoeba #4918241 |
| `uk/maju-krashchu-ideju` | Я маю кращу ідею. | Tatoeba #6859050 |
| `uk/zapiznjuvatymus` | Якщо я запізнюватимусь, не чекай на мене. | Tatoeba #10124149 |
| `uk/skilky-pyva-kupyla` | Скільки пива ти купила? | Tatoeba #7147463 |
| `uk/vy-vyshchi-za-mene` | Ви вищі за мене. | Tatoeba #1598660 |
| `uk/ty-tam-budesh` | Ти там будеш? | Tatoeba #6909585 |
| `uk/chomu-dyvlyatsya` | Чому на мене всі дивляться? | Tatoeba #8116285 |
| `uk/tom-ne-rozumie-chomu` | Том не розуміє, чому ми це зробили. | Tatoeba #7215511 |
| `uk/tom-ta-meri` | Том та Мері закінчили. | Tatoeba #5805165 |
| `uk/mozhe-buty-rakom` | Його хвороба може бути раком. | Tatoeba #5751256 |
| `uk/ty-dopomih-tomu` | Ти допоміг Тому? | Tatoeba #5903327 |
| `uk/vse-shche-chasu` | У нас все ще багато часу. | Tatoeba #6933809 |
| `uk/odne-odnoho` | Ми одне одного не розуміємо. | Tatoeba #6690486 |
| `uk/bud-oberezhnyj` | Будь обережний. | Tatoeba #5943059 |
| `uk/budte-uvazhni` | Будьте уважні. | Tatoeba #5943141 |
| `uk/tom-breshe` | Я переконаний, що Том бреше. | Tatoeba #7743789 |
| `uk/ne-znaje-jak-zavjazuvaty` | Том не знає як зав'язувати шнурки. | Tatoeba #4930523 |
| `uk/vytrachaje-na-sebe` | Моя дружина витрачає на себе забагато грошей. | Tatoeba #8015367 |
