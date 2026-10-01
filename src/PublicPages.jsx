import React from 'react';

const INFO = {
  brand: 'BeeChess',
  legalName: 'ИП KERIMOV',
  iin: '040818550320',
  address: 'г. Алматы, ул. Толе би, 286/1, кв. 34',
  email: 'tamerkross@gmail.com',
  phone: '+7 777 068 33 67',
  instagram: 'https://www.instagram.com/beechess.academy/',
  priceKzt: '110 000 ₸',
  workHours: 'ежедневно, 10:00–22:00 (UTC+5)',
};

const nav = [
  ['/about', 'О школе'],
  ['/payment', 'Оплата и возврат'],
  ['/offer', 'Публичная оферта'],
  ['/privacy', 'Конфиденциальность'],
];

function Header() {
  return <header className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
    <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
      <a href="/about" className="flex items-center gap-2 no-underline"><span className="text-2xl">🐝</span><span className="text-xl font-extrabold text-slate-900">bee<span className="text-amber-500">chess</span></span></a>
      <nav className="hidden md:flex items-center gap-5 text-sm text-slate-600">{nav.map(([href,label]) => <a key={href} href={href} className="hover:text-slate-950">{label}</a>)}</nav>
      <a href="/" className="text-sm font-semibold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800">Войти</a>
    </div>
  </header>
}

function Footer() {
  return <footer className="border-t border-slate-200 bg-white mt-16">
    <div className="max-w-6xl mx-auto px-5 py-9 grid md:grid-cols-3 gap-8 text-sm text-slate-600">
      <div><div className="font-bold text-slate-900 mb-2">BeeChess</div><p>Онлайн-школа индивидуального обучения шахматам для детей и взрослых.</p></div>
      <div><div className="font-bold text-slate-900 mb-2">Документы</div><div className="flex flex-col gap-1.5">{nav.slice(1).map(([href,label]) => <a key={href} href={href} className="hover:text-slate-950">{label}</a>)}</div></div>
      <div><div className="font-bold text-slate-900 mb-2">Продавец</div><p>{INFO.legalName}</p><p>ИИН: {INFO.iin}</p><p>{INFO.address}</p><a className="block hover:text-slate-950" href={`mailto:${INFO.email}`}>{INFO.email}</a><a className="block hover:text-slate-950" href={`tel:${INFO.phone.replace(/\s/g,'')}`}>{INFO.phone}</a><p className="mt-1">График работы: {INFO.workHours}</p></div>
    </div>
    <div className="max-w-6xl mx-auto px-5 pb-8 text-xs text-slate-400">© 2026 BeeChess. Все права защищены.</div>
  </footer>
}

function Shell({children}) { return <div className="min-h-screen bg-slate-50 text-slate-900"><Header/><main>{children}</main><Footer/></div> }
function Section({title, children}) { return <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm"><h2 className="text-xl md:text-2xl font-bold mb-4">{title}</h2><div className="text-slate-600 leading-7 space-y-3">{children}</div></section> }
function Doc({title, intro, children}) { return <Shell><div className="max-w-4xl mx-auto px-5 py-12"><div className="mb-8"><p className="text-amber-600 font-semibold text-sm mb-2">BeeChess · юридическая информация</p><h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{title}</h1>{intro && <p className="mt-3 text-slate-600">{intro}</p>}<p className="mt-2 text-xs text-slate-400">Редакция от 28 сентября 2026 года</p></div><div className="space-y-5">{children}</div></div></Shell> }

export function AboutPage() {
  return <Shell>
    <section className="max-w-6xl mx-auto px-5 pt-16 pb-10 grid lg:grid-cols-2 gap-10 items-center">
      <div><div className="inline-flex px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold mb-5">ONLINE CHESS ACADEMY</div><h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05]">Шахматы, которые становятся <span className="text-amber-500">понятными.</span></h1><p className="mt-6 text-lg text-slate-600 leading-8 max-w-xl">BeeChess — онлайн-школа индивидуального обучения шахматам. Уроки проходят один на один с тренером на собственной интерактивной платформе.</p><div className="mt-7 flex flex-wrap gap-3"><a href="#tariff" className="px-5 py-3 rounded-xl bg-slate-900 text-white font-semibold">Посмотреть тариф</a><a href={INFO.instagram} target="_blank" rel="noreferrer" className="px-5 py-3 rounded-xl bg-white border border-slate-200 font-semibold">Instagram</a></div></div>
      <div className="bg-slate-900 text-white rounded-3xl p-8 md:p-10 shadow-xl"><div className="text-5xl mb-6">♟️</div><h2 className="text-2xl font-bold">Индивидуальный подход</h2><div className="mt-6 grid gap-4 text-slate-300"><p>✓ Занятия 1-на-1 с тренером</p><p>✓ Интерактивная шахматная доска и видеосвязь</p><p>✓ Материалы и задания под уровень ученика</p><p>✓ Для детей и взрослых, от начинающих до турнирных игроков</p></div></div>
    </section>
    <section className="max-w-6xl mx-auto px-5 py-10 grid md:grid-cols-3 gap-5"><Section title="Персональная программа"><p>Тренер адаптирует программу под уровень, цели и темп ученика.</p></Section><Section title="Онлайн-платформа"><p>Доска, видеосвязь и учебные материалы собраны в одном месте.</p></Section><Section title="Регулярный прогресс"><p>Разбираем партии, тактику, стратегию, дебюты и практические ошибки.</p></Section></section>
    <section id="tariff" className="max-w-6xl mx-auto px-5 py-10"><div className="bg-white border-2 border-amber-400 rounded-3xl p-8 md:p-10 grid md:grid-cols-[1fr_auto] gap-8 items-center shadow-sm"><div><p className="text-amber-600 font-bold text-sm">ИНДИВИДУАЛЬНЫЙ АБОНЕМЕНТ</p><h2 className="text-3xl font-extrabold mt-2">8 занятий × 45 минут</h2><p className="text-slate-600 mt-3">Онлайн-занятия по предварительно согласованному расписанию.</p></div><div className="md:text-right"><div className="text-4xl font-black">{INFO.priceKzt}</div></div></div></section>
    <section className="max-w-6xl mx-auto px-5 py-10 grid md:grid-cols-2 gap-5"><Section title="Как проходят занятия"><p>После приобретения абонемента ученик получает доступ к платформе BeeChess. Расписание согласовывается с тренером. В назначенное время ученик входит в свою учебную комнату и занимается онлайн.</p></Section><Section title="Оплата и поддержка"><p>Оплата производится доступным способом на защищённой платёжной странице. Условия переноса и возврата описаны на странице «Оплата и возврат».</p><a href="/payment" className="inline-block font-semibold text-amber-600">Подробнее →</a></Section></section>
  </Shell>
}

export function PaymentPage() { return <Doc title="Оплата, перенос и возврат" intro="Правила оплаты и использования абонементов BeeChess.">
  <Section title="1. Стоимость и оплата"><p>Стоимость индивидуального абонемента: <strong>{INFO.priceKzt}</strong> за 8 занятий по 45 минут.</p><p>Оплата производится банковской картой на защищённой платёжной странице платёжного провайдера. BeeChess не получает и не хранит полные реквизиты банковской карты клиента.</p></Section>
  <Section title="2. Получение услуги"><p>После подтверждения оплаты представитель BeeChess связывается с клиентом, согласовывает расписание и предоставляет или активирует доступ к онлайн-платформе. Абонемент включает 8 индивидуальных онлайн-занятий продолжительностью 45 минут каждое.</p></Section>
  <Section title="3. Перенос занятия"><p>Занятие можно бесплатно перенести, предупредив BeeChess или тренера не менее чем за 12 часов до его начала. При отмене или переносе менее чем за 12 часов занятие может считаться проведённым, кроме случаев, отдельно согласованных с BeeChess.</p><p>Если занятие отменяется по инициативе тренера или BeeChess, оно переносится без потери занятия для ученика.</p></Section>
  <Section title="4. Возврат"><p>Клиент может запросить возврат стоимости неиспользованных занятий. Сумма возврата рассчитывается исходя из количества неиспользованных занятий в оплаченной части абонемента, с учётом уже оказанных услуг и применимых комиссий платёжных систем, если такие комиссии не подлежат возврату.</p><p>Для запроса возврата напишите на <a className="font-semibold text-amber-600" href={`mailto:${INFO.email}`}>{INFO.email}</a> и укажите имя ученика, дату и сумму оплаты. Возврат производится тем способом и в сроки, которые допускаются применённым способом оплаты и законодательством Республики Казахстан.</p></Section>
</Doc> }

export function OfferPage() { return <Doc title="Публичная оферта" intro="Договор на оказание услуг онлайн-обучения шахматам.">
  <Section title="1. Общие положения"><p>Настоящий документ является публичным предложением {INFO.legalName}, ИИН {INFO.iin}, далее — «Исполнитель», заключить договор на оказание услуг онлайн-обучения шахматам. Оплата услуг означает принятие клиентом условий настоящей оферты.</p><p>Если ученик является несовершеннолетним, заказчиком и плательщиком выступает его родитель или иной законный представитель либо лицо, действующее с его согласия.</p></Section>
  <Section title="2. Предмет договора"><p>Исполнитель организует индивидуальные дистанционные занятия по шахматам с использованием платформы BeeChess и средств онлайн-связи. Конкретный тренер, расписание и программа определяются с учётом уровня и целей ученика.</p></Section>
  <Section title="3. Стоимость"><p>Текущий тариф: {INFO.priceKzt} за 8 индивидуальных занятий продолжительностью 45 минут каждое. Оплата производится в казахстанских тенге.</p></Section>
  <Section title="4. Порядок оказания услуг"><p>После оплаты Исполнитель предоставляет доступ к услуге и согласовывает расписание. Клиент обязуется обеспечить интернет-соединение и устройство, необходимые для участия в онлайн-занятии.</p></Section>
  <Section title="5. Переносы и возвраты"><p>Бесплатный перенос возможен при уведомлении не менее чем за 12 часов. При более поздней отмене занятие может считаться проведённым. Возврат за неиспользованные занятия осуществляется по правилам, опубликованным на странице <a className="font-semibold text-amber-600" href="/payment">«Оплата и возврат»</a>.</p></Section>
  <Section title="6. Ответственность"><p>Стороны несут ответственность в соответствии с законодательством Республики Казахстан. Исполнитель не гарантирует конкретный спортивный рейтинг или турнирный результат, поскольку результат обучения зависит в том числе от регулярности занятий и самостоятельной работы ученика.</p></Section>
  <Section title="7. Персональные данные"><p>Обработка персональных данных осуществляется в соответствии с опубликованной <a className="font-semibold text-amber-600" href="/privacy">Политикой конфиденциальности</a>.</p></Section>
  <Section title="8. Реквизиты Исполнителя"><p><strong>{INFO.legalName}</strong><br/>ИИН: {INFO.iin}<br/>Адрес: {INFO.address}<br/>Email: {INFO.email}<br/>Телефон: {INFO.phone}</p></Section>
</Doc> }

export function PrivacyPage() { return <Doc title="Политика конфиденциальности" intro="Как BeeChess обрабатывает данные пользователей платформы.">
  <Section title="1. Кто обрабатывает данные"><p>Оператором персональных данных является {INFO.legalName}, ИИН {INFO.iin}, адрес: {INFO.address}. По вопросам обработки данных можно обратиться на {INFO.email}.</p></Section>
  <Section title="2. Какие данные могут обрабатываться"><p>Имя и контактные данные клиента или ученика, данные учётной записи, сведения о расписании и обучении, сообщения в рамках поддержки, технические данные, необходимые для работы платформы, а также сведения о факте и статусе оплаты. Полные данные банковских карт BeeChess не хранит.</p></Section>
  <Section title="3. Для чего используются данные"><p>Для регистрации и работы аккаунта, организации и проведения занятий, связи с клиентом, поддержки, учёта оплат, исполнения договора, обеспечения безопасности платформы и выполнения требований законодательства.</p></Section>
  <Section title="4. Данные несовершеннолетних"><p>Поскольку значительная часть учеников BeeChess — дети, предоставление данных несовершеннолетнего для обучения осуществляется родителем или законным представителем либо с его согласия.</p></Section>
  <Section title="5. Передача третьим лицам"><p>Данные могут передаваться поставщикам технических и платёжных сервисов только в объёме, необходимом для работы платформы, проведения платежа или исполнения требований закона. BeeChess не продаёт персональные данные.</p></Section>
  <Section title="6. Обращения пользователя"><p>По вопросам доступа, уточнения или удаления данных пользователь может обратиться на <a className="font-semibold text-amber-600" href={`mailto:${INFO.email}`}>{INFO.email}</a>. Запрос рассматривается с учётом требований законодательства и необходимости хранения отдельных данных для исполнения обязательств.</p></Section>
</Doc> }

export function PublicRoute() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/about') return <AboutPage/>;
  if (path === '/payment') return <PaymentPage/>;
  if (path === '/offer') return <OfferPage/>;
  if (path === '/privacy') return <PrivacyPage/>;
  return null;
}

export function isPublicPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return ['/about','/payment','/offer','/privacy'].includes(path);
}
