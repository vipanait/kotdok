// Reproducible export. Set PLAYWRIGHT_MODULE and CHROME_PATH for your machine.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/skyeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = __dirname;
const url = pathToFileURL(path.join(root, 'index.html')).href;
(async()=>{
 const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--allow-file-access-from-files']});
 const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 await page.setViewportSize({width:1200,height:1200});
 await page.goto(pathToFileURL(path.join(root,'assets-preview.html')).href);await page.evaluate(()=>document.fonts.ready);await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));
 await page.locator('.asset-board').screenshot({path:path.join(root,'transparent-assets-preview.png')});
 await page.setViewportSize({width:390,height:844});
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url+'?mode=raw&id=02');await page.evaluate(()=>document.fonts.ready);
 const screens=await page.evaluate(()=>window.designScreens);
 const report={screens:[],errors,auth:[]};
 for(const screen of screens){
   await page.goto(url+'?mode=raw&id='+screen.id);await page.evaluate(async()=>{await document.fonts.load('700 30px Nunito');await document.fonts.load('400 15px Manrope');await document.fonts.ready});
   await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
   if(screen.id==='08')await page.evaluate(()=>{let sc=document.querySelector('.scroll'),section=[...sc.querySelectorAll('details')].find(x=>x.textContent.includes('Образ жизни'));sc.scrollTop=section.offsetTop-sc.offsetTop});
   if(['30','31'].includes(screen.id))await page.evaluate(()=>{let sc=document.querySelector('.scroll');sc.scrollTop=sc.scrollHeight});
   await page.screenshot({path:path.join(root,'screens',screen.id+'.png')});
   const dimensions=await page.evaluate(()=>{let sc=document.querySelector('.scroll');return {contentHeight:sc.scrollHeight,viewportHeight:sc.clientHeight,widthOverflow:sc.scrollWidth>sc.clientWidth,fonts:document.fonts.check('700 30px Nunito')&&document.fonts.check('400 15px Manrope'),images:[...document.images].every(i=>i.complete&&i.naturalWidth>0)}});
   report.screens.push({...screen,...dimensions});
   if(['02','03','04','23','24','25','26','43','44'].includes(screen.id)){
     const auth=await page.evaluate(()=>({logo:!!document.querySelector('.auth-masthead .brand'),pets:!!document.querySelector('.auth-masthead [src$="welcome-pets.png"]'),tagline:document.querySelector('.auth-tagline')?.textContent,providers:document.querySelectorAll('[data-oauth]').length}));
     const expected=['24','25','26'].includes(screen.id)?0:2;
     if(!auth.logo||auth.pets||!auth.tagline||auth.providers!==expected)throw new Error('Auth contract failed on '+screen.id);
     report.auth.push({id:screen.id,...auth});
   }

   if(dimensions.contentHeight>dimensions.viewportHeight+2){
     await page.evaluate(()=>{let s=document.querySelector('.screen'),sc=s.querySelector('.scroll');sc.scrollTop=0;s.style.height=(s.clientHeight+sc.scrollHeight-sc.clientHeight)+'px';sc.style.overflow='visible';});
     await page.locator('.screen').screenshot({path:path.join(root,'screens',screen.id+'-full.png')});
   }
 }
 await page.setViewportSize({width:1760,height:2000});await page.goto(url+'?mode=overview');await page.evaluate(()=>document.fonts.ready);await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));await page.locator('.overview').screenshot({path:path.join(root,'overview.png')});
 await page.evaluate(()=>{document.querySelector('.overview').style.width='916px';document.querySelector('.overview-grid').style.gridTemplateColumns='repeat(2,390px)';document.querySelector('.overview-grid').innerHTML=['02','04','24','17'].map(labeled).join('');document.querySelector('.overview-top h1').textContent='Лапка · обновлённые экраны';document.querySelector('.overview-top .brand').remove()});await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));await page.locator('.overview').screenshot({path:path.join(root,'updated-screens.png')});
 await page.setViewportSize({width:1640,height:1800});await page.goto(url+'?mode=system');await page.evaluate(()=>document.fonts.ready);await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));await page.locator('.system-board').screenshot({path:path.join(root,'design-system.png')});
 // Review the two specified user journeys against the rendered prototype.
 await page.setViewportSize({width:1100,height:940});
 await page.goto(url+'?mode=prototype&id=01');
 const screen=()=>page.locator('.screen');
 const click=async(name)=>{await screen().getByRole('button',{name,exact:true}).click()};
 const at=async(id)=>page.waitForFunction(id=>current===id,id,{timeout:6000});
 await at('02');await click('Создать аккаунт');await at('04');await click('Зарегистрироваться');await at('23');await click('Уже есть аккаунт');await click('Войти');await at('05');await click('Добавить питомца');await at('07');await click('Сохранить');await at('32');await click('Проверка');await click('Далее');await at('10');await click('Проверить');await at('11');await at('12');await click('Полезно');await at('30');
 if(!await screen().getByText('ЭКСТРЕННО',{exact:true}).count())throw new Error('Urgency changed during feedback');
 await click('Отправить');await at('31');await click('Питомцы');await at('06');
 report.newUserRoute='passed';
 await page.goto(url+'?mode=prototype&id=01');await at('02');await click('Войти');await at('06');await click('Профиль');await at('18');await screen().locator('[data-go="16"]').click();await at('16');await screen().locator('.history-card').first().click();await at('13');await click('Питомцы');await at('06');await screen().locator('.pet').first().click();await at('32');await click('Удалить питомца');await at('14');await click('Удалить');await at('05');
 report.returningUserRoute='passed';
 await page.goto(url+'?mode=prototype&id=08');await screen().locator('[data-select-label="Питание"]').click();await at('15');await click('Не указано');await at('08');
 if(await screen().locator('[data-select-label="Питание"] span').textContent()!=='Не указано')throw new Error('Optional selection did not reset');
 report.optionalSelect='passed';
 report.oauth=[];
 for(const scenario of [{id:'02',provider:'Google',button:'Продолжить с Google',target:'06'},{id:'04',provider:'Яндекс ID',button:'Войти с Яндекс ID',target:'05'}]){
   await page.goto(url+'?mode=prototype&id='+scenario.id);await click(scenario.button);await at('43');await at(scenario.target);report.oauth.push({...scenario,result:'passed'});
 }
 await page.goto(url+'?mode=prototype&id=04');await click('Продолжить с Google');await at('43');await click('Отмена');await at('04');report.oauthCancel='passed';
 await page.goto(url+'?mode=prototype&id=44');await click('Продолжить с Google');await at('43');await at('06');report.oauthRetry='passed';

 report.smallScreens=[];
 await page.setViewportSize({width:360,height:640});
 for(const id of ['05','12','17','45']){
   await page.goto(url+'?mode=raw&id='+id);await page.addStyleTag({content:'.screen,body.raw #app{width:360px;height:640px}'});await page.evaluate(()=>document.fonts.ready);await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));
   const fit=await page.evaluate(()=>{const sc=document.querySelector('.scroll'),target=document.querySelector('.empty')||document.querySelector('.urgency');const a=sc.getBoundingClientRect(),b=target.getBoundingClientRect();return {fits:b.top>=a.top-1&&b.bottom<=a.bottom+1,horizontalOverflow:sc.scrollWidth>sc.clientWidth}});
   report.smallScreens.push({id,...fit});await page.screenshot({path:path.join(root,'screens',id+'-360.png')});
 }
 // Expanded notes preview: heading supplies the visible label.
 await page.setViewportSize({width:390,height:844});
 await page.goto(url+'?mode=raw&id=07');await page.evaluate(()=>document.fonts.ready);
 const notes=page.locator('details').filter({has:page.locator('summary',{hasText:'Заметки'})});
 await notes.locator('summary').click();await notes.scrollIntoViewIfNeeded();
 if(await notes.locator('.label').count() || await notes.locator('textarea').getAttribute('aria-label')!=='Заметки')throw new Error('Notes label contract failed');
 await notes.screenshot({path:path.join(root,'notes-detail.png')});
 report.notesLabel='passed';
 fs.writeFileSync(path.join(root,'render-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({screens:report.screens.length,errors,widthOverflow:report.screens.filter(x=>x.widthOverflow).map(x=>x.id),badAssets:report.screens.filter(x=>!x.fonts||!x.images).map(x=>x.id),newUserRoute:report.newUserRoute,returningUserRoute:report.returningUserRoute,optionalSelect:report.optionalSelect,smallScreens:report.smallScreens,auth:report.auth,oauth:report.oauth,oauthCancel:report.oauthCancel,oauthRetry:report.oauthRetry}));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
