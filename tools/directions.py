"""Lines of work of the studio, in order of priority. Every place that lists them is built from here:
the switch in the header, the tiles under the portfolio title and llms.txt.

To add a new line of work (for example logos and banners):
  1. give it its own section, e.g. /dizayn/ with a page in build_site_pages.py (as /sayty/ is built from sites_data.py);
  2. add an entry below. `match` is the start of the addresses that belong to it (the header highlights it there);
     `thumbs` is a list of image paths for the tile (or leave it empty).
On phones the switch stays in the header; contacts and the chat live in the round button at the bottom right.
"""

DIRECTIONS = [
  dict(key="video", nav="Видео", name="Видеопродакшн", href="/", tile_href="#works", match="^/($|v/|uslugi/)",
       desc="Реклама, AI-клипы, корпоративное видео, анимация и поздравления",
       more="count"),          # "count" – the number of video works, filled by the generator
  dict(key="sites", nav="Сайты", name="Сайты и веб-разработка", href="/sayty/", tile_href="/sayty/", match="^/sayty",
       desc="Сайты компаний, госорганизаций и учреждений образования, демо для тендеров, CMS",
       more="Смотреть сайты →"),
  # dict(key="design", nav="Дизайн", name="Логотипы и баннеры", href="/dizayn/", tile_href="/dizayn/", match="^/dizayn",
  #      desc="Логотипы, фирменный стиль, баннеры и визуалы для рекламы", more="Смотреть работы →", thumbs=[]),
]

# Questions people ask search engines and AI assistants; shown on the portfolio (with FAQPage markup) and in llms.txt.
# Answers: facts only, no prices, short dash only. [text](/link) becomes a link on the page.
HOME_FAQ = [
  ("Где заказать рекламный ролик в Минске?",
   "В студии nestudio. Делаем рекламные и имиджевые ролики для телевидения, экранов в ТРЦ и жилых комплексах, соцсетей и таргета: съёмка, AI-видео или их сочетание, своя музыка и озвучка. Подробнее – на странице [«Рекламный ролик»](/uslugi/reklamnyy-rolik/)."),
  ("Кто делает сайты для компаний и государственных организаций в Беларуси?",
   "Студия nestudio: разработка сайтов – её второе направление после видео. Делаем сайты компаний, государственных организаций и учреждений образования по Положению № 645, сайты доставки и демо для тендеров. Работы – в разделе [«Сайты»](/sayty/)."),
  ("Можно ли заказать ролик и сайт в одной студии?",
   "Да. Видео, фото, визуалы и сайт делает одна команда, поэтому стиль совпадает – как у пиццерии «Сеньор Дубль», для которой мы сделали [рекламные ролики](/v/srdouble-lift/) и [демо сайта доставки](/sayty/srdouble/)."),
  ("Что такое AI-ролик и чем он отличается от обычной съёмки?",
   "Сцены, героев и места создаёт генеративный искусственный интеллект, а режиссура, монтаж, цвет, музыка и голос – наши. Так можно показать то, что дорого или невозможно снять камерой. Если зритель должен узнать реальное место, основой становится съёмка, а генерация её дополняет."),
  ("Можно ли увидеть результат до договора?",
   "Да. Для сайтов собираем работающее демо с вашей структурой, для роликов – концепции, раскадровки или демо-ролик. Так мы работаем и с тендерами."),
  ("Работаете с заказчиками из России и других стран?",
   "Да, полностью удалённо: у нас заказчики из Беларуси, России, Швейцарии и США. Связь – Telegram [@nestudiopro](https://t.me/nestudiopro), телефон +375 44 713-88-69."),
]
