(function(g){
  'use strict';
  const pad=n=>String(n).padStart(2,'0');
  const key=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const today=()=>key(new Date());
  function parse(s){
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
    const [y,m,d]=s.split('-').map(Number),date=new Date(y,m-1,d,12);
    return y>=1900&&y<=2200&&key(date)===s?date:null;
  }
  const weekday=d=>['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][(parse(d)||new Date()).getDay()];
  const label=d=>{const date=parse(d);return date?(date.getMonth()+1)+'월 '+date.getDate()+'일 '+weekday(d):'';};
  const month=d=>{const date=parse(d);return date?date.getFullYear()+'년 '+(date.getMonth()+1)+'월':'';};
  const shift=(d,n)=>{const date=parse(d)||new Date();return key(new Date(date.getFullYear(),date.getMonth()+n,1,12));};
  function grid(d){const date=parse(d)||new Date(),first=new Date(date.getFullYear(),date.getMonth(),1,12),start=new Date(first);start.setDate(1-first.getDay());return Array.from({length:42},(_,i)=>{const x=new Date(start);x.setDate(start.getDate()+i);return{day:key(x),number:x.getDate(),outside:x.getMonth()!==first.getMonth()};});}
  g.RTDates=Object.freeze({key,today,parse,weekday,label,month,shift,grid});
})(window);
