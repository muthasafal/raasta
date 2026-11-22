// Progressive enhancement for the tool pages (print, copy, remembered and case details). Served at /r/assets/enhance.js.
// Pages link it with ?v=<hash of this script>, so a browser never keeps an old copy after a change.
export const ENHANCE_JS = `(function(){
function ready(f){if(document.readyState!=="loading")f();else document.addEventListener("DOMContentLoaded",f)}
ready(function(){
document.querySelectorAll("[data-print]").forEach(function(b){b.hidden=false;b.addEventListener("click",function(){window.print()})});
document.querySelectorAll("[data-copy]").forEach(function(b){
b.hidden=false;
b.addEventListener("click",function(){
var ta=b.parentElement&&b.parentElement.querySelector("textarea");
if(!ta)return;
ta.focus();ta.select();
var done=function(){b.textContent="Copied"};
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(ta.value).then(done,function(){try{document.execCommand("copy");done()}catch(e){}})}
else{try{document.execCommand("copy");done()}catch(e){}}
});
});
// Remember the person's own details (name, address, phone, email, job) on this device only, to prefill the next letter.
var KEY="raasta_me";
var form=document.querySelector("form[data-remember-form]");
if(form){
var read=function(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")||{}}catch(e){return {}}};
var saved=read();
// Details the person wrote when describing the problem (locate.js keeps only these, on this device, for 7 days).
var kase=window.raastaReadCase?window.raastaReadCase():{};
var fields=form.querySelectorAll("[data-remember]");
var fromCase=0;
fields.forEach(function(el){var k=el.getAttribute("data-remember");if(el.value)return;if(saved[k])el.value=saved[k];else if(kase[k]){el.value=kase[k];fromCase++}});
form.querySelectorAll("[data-case]").forEach(function(el){var k=el.getAttribute("data-case");if(!el.value&&kase[k]){el.value=String(kase[k]).slice(0,160);fromCase++}});
var note=form.querySelector("[data-case-note]");
if(note&&fromCase)note.hidden=false;
form.addEventListener("submit",function(){var s=read();fields.forEach(function(el){var k=el.getAttribute("data-remember");if(el.value&&el.value.trim())s[k]=el.value.trim().slice(0,300)});try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){}});
var fg=form.querySelector("[data-forget]");
if(fg&&(Object.keys(saved).length||fromCase)){fg.hidden=false;fg.addEventListener("click",function(){try{localStorage.removeItem(KEY);localStorage.removeItem("raasta_case")}catch(e){}form.querySelectorAll("[data-remember],[data-case]").forEach(function(el){var k=el.getAttribute("data-remember")||el.getAttribute("data-case");if(el.value&&(saved[k]===el.value||String(kase[k]||"").slice(0,160)===el.value))el.value=""});if(note)note.hidden=true;fg.hidden=true})}
}
});
})();
`;

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const ENHANCE_SRC = `/r/assets/enhance.js?v=${hash(ENHANCE_JS)}`;
