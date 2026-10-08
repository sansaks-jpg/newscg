"""Export one editable, independently controlled NewsCG GT composition."""
import json
import re
import uuid
import zipfile
from pathlib import Path
from xml.etree import ElementTree as E

ROOT = Path(__file__).resolve().parents[1]
OUT = Path.home() / 'Documents' / 'News-Vmix'
TITLE = 'NewsCG-Berita-Full'
match = re.search(r'export const broadcastMotion = \{(.*?)\} as const;', (ROOT / 'packages/shared/src/index.ts').read_text(encoding='utf-8'), re.S)
M = {k: int(v) for k, v in re.findall(r'(\w+):\s*(\d+)', match.group(1))}


def el(tag, **attrs):
    return E.Element(tag, {k: str(v) for k, v in attrs.items()})


def layer(root, name, x, y, w, h):
    n = el('Layer', Name=name, Location=f'{x},{y},0', Dimensions=f'{w},{h},0', DataFlags='Hidden')
    root.append(n)
    return E.SubElement(E.SubElement(n, 'Layer.Composition'), 'Composition', Width=str(w), Height=str(h))


def text(c, name, value, x, y, w, h, size=64, family='Arial Narrow', weight='Bold', color='#FF080808', auto='Shrink', align='Left', command=False, ticker=False):
    tag = 'Ticker' if ticker else 'TextBlock'
    n = el(tag, Name=name, Text=value, Location=f'{x},{y},0', Dimensions=f'{w},{h},0', FontSize=size, FontFamily=family, FontWeight=weight, VerticalAlign='Center', TextAlign=align, TextWordWrapping='NoWrap', Visible='False', DataFlags='None' if command else 'NoEvents, ShowVisible')
    if not ticker:
        n.set('AutoSize', auto)
    E.SubElement(E.SubElement(n, tag+'.Fill'), 'Brush', Color=color)
    c.append(n)
    return n


def image(c, name, asset, x, y, w, h, bound=None, pad=0):
    n = el('Image', Name=name, Location=f'{x},{y},0', Dimensions=f'{w},{h},0', SizeMode='Stretch', Visible='False', DataFlags='NoEvents, ShowVisible')
    E.SubElement(E.SubElement(n, 'Image.Bitmap'), 'Bitmap', Source='assets\\'+asset+'.png')
    if bound:
        E.SubElement(E.SubElement(n, 'Image.Bounding'), 'Bounding', Object=bound, Padding=f'{pad},0,{pad},0')
    c.append(n)
    return n


def anim(kind, target, ms, out=False, direction=None, delay=0):
    a = el(kind, Object=target, Duration=ms/1000, Delay=delay/1000, Interpolation='CubicEasingIn' if out else 'CubicEasingOut')
    if out:
        a.set('Reverse', 'True')
    if direction:
        a.set('Direction', direction)
    return a


def package(r, title):
    E.indent(r,space='  ')
    doc=E.tostring(r,encoding='utf-8',xml_declaration=True)
    (OUT/'source'/f'{title}.gtxml').write_bytes(doc)
    resources=el('resources'); types=el('Types',xmlns='http://schemas.openxmlformats.org/package/2006/content-types')
    E.SubElement(types,'Default',Extension='xml',ContentType='text/xml'); payloads={}
    for n in r.findall('.//Bitmap'):
        filename=n.attrib['Source']; guid=str(uuid.uuid5(uuid.NAMESPACE_URL,'newscg/'+filename))
        if guid in payloads: continue
        payloads[guid]=(OUT/'assets'/filename.split('\\')[-1]).read_bytes()
        resource=E.SubElement(resources,'resource',filename=filename)
        E.SubElement(resource,'source',guid=guid).text=filename
        E.SubElement(types,'Override',PartName='/'+guid,ContentType='application/octet-stream')
    with zipfile.ZipFile(OUT/f'{title}.gtzip','w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('document.xml',doc); z.writestr('resources.xml',E.tostring(resources,encoding='utf-8',xml_declaration=True)); z.writestr('[Content_Types].xml',E.tostring(types,encoding='utf-8',xml_declaration=True))
        for name,data in payloads.items(): z.writestr(name,data)


def independent(kind):
    r=el('Composition',Width=1920,Height=1080)
    if kind=='Ticker':
        c=layer(r,'TickerLayer',70,994,1780,56)
        image(c,'TickerPanel','ticker',0,0,1540,56)
        n=text(c,'Ticker','INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI • ',0,0,1540,56,34,weight='Regular',color='#FFFFFFFF',ticker=True)
        n.attrib.update(Speed='4',Direction='Left',Type='Replace')
        image(c,'ClockPanel','clock',1540,0,240,56)
        text(c,'Clock','{0:HH:mm} WIB',1552,0,216,56,36,'Arial',color='#FFFFFFFF',align='Center')
        image(c,'BrandPanel','brand',0,0,340,56,'Brand',20)
        text(c,'Brand','CNNINDONESIA.COM',20,0,1,56,28,color='#FFFFFFFF',auto='Width')
        ms,outs=M['tickerInMs'],M['tickerOutMs']; target='TickerLayer'
    elif kind=='Logo':
        c=layer(r,'LogoLayer',1610,842,240,146)
        image(c,'LogoPanel','white',0,0,240,146)
        image(c,'Logo','logo',28,10,184,86).set('SizeMode','Centered')
        text(c,'LogoSub','Indonesia',10,98,220,38,38,'Arial','Regular',align='Center')
        c=layer(r,'LiveLayer',1610,778,240,64)
        image(c,'LivePanel','live',0,0,240,64)
        text(c,'LiveLabel','LIVE',0,0,240,64,46,'Arial','Regular','#FFFFFFFF',align='Center')
        ms,outs=M['logoInMs'],M['logoOutMs']; target='LogoLayer'
    for n in r.iter():
        if 'Visible' in n.attrib: n.set('Visible','True')
    for out in [False,True]:
        b=E.SubElement(r,'Storyboard',Type='TransitionOut' if out else 'TransitionIn')
        animations=[anim('Reveal' if kind=='Logo' else 'Fly',target,outs if out else ms,direction='Bottom'),anim('Fade',target,outs if out else ms)]
        if kind=='Logo':
            duration=M['liveOutMs' if out else 'liveInMs']
            animations += [anim('Reveal','LiveLayer',duration,direction='Bottom'),anim('Fade','LiveLayer',duration)]
        E.SubElement(b,'Storyboard.Animations').extend(animations)
    package(r,'NewsCG-'+kind)


def main():
    for folder in ['assets', 'source', 'controls', 'previews', 'verification']:
        (OUT/folder).mkdir(parents=True, exist_ok=True)
    r = el('Composition', Width=1920, Height=1080)
    c = layer(r, 'PanelLayer', 70,842,1780,146)
    image(c,'Panel','panel',0,0,1780,146)
    c = layer(r,'BodyLayer',70,842,1540,146)
    text(c,'Headline','JUDUL BERITA UTAMA',38,10,1474,70)
    text(c,'Detail','Keterangan tambahan berita',38,81,1474,55,46,'Arial','Regular')
    text(c,'Name','NAMA NARASUMBER',38,81,575,55,44,'Arial')
    image(c,'Divider','divider',629,91,4,36)
    text(c,'Role','Jabatan / keterangan',645,81,867,55,44,'Arial','Regular')
    c = layer(r,'TopicLayer',70,780,1540,62)
    image(c,'TopicPanel','topic',0,0,400,62,'Topic',38)
    text(c,'Topic','TOPIK BERITA',38,0,1,62,46,'Arial','DemiBold','#FFFFFFFF','Width')
    c = layer(r,'LocationLayer',70,76,1400,53)
    image(c,'LocationPanel','location',0,0,220,53,'Location',26)
    text(c,'Location','JAKARTA',26,0,1,53,32,'Arial','Bold','#FFFFFFFF','Width')
    groups = {
        'headline':dict(bit=1,texts=['Headline'],images=[],inMs=M['textInMs'],outMs=M['textOutMs']),
        'topic':dict(bit=2,texts=['Topic'],images=['TopicPanel'],inMs=M['topicInMs'],outMs=M['topicOutMs']),
        'detail':dict(bit=4,texts=['Detail'],images=[],inMs=M['detailInMs'],outMs=M['detailOutMs']),
        'location':dict(bit=8,texts=['Location'],images=['LocationPanel'],inMs=M['locationInMs'],outMs=M['locationOutMs']),
        'sot':dict(bit=16,texts=['Name','Role'],images=['Divider'],inMs=M['detailInMs'],outMs=M['detailOutMs'])}
    commands = {}
    for group,g in groups.items():
        for out in [False,True]:
            ms=g['outMs' if out else 'inMs']; a=[]
            if group=='topic':
                for target in ['Topic','TopicPanel']:
                    a += [anim('Fly',target,ms,out,'Bottom'),anim('Fade',target,ms,out)]
            elif group=='location':
                a=[anim('Reveal','LocationLayer',ms,out,'Left'),anim('Fade','LocationLayer',ms,out)]
            else:
                a=[anim('Fade',target,ms,out) for target in g['texts']+g['images']]
            commands[group+('Out' if out else 'In')]=a
    panel_in=[anim('Reveal','Panel',M['panelInMs'],direction='Right'),anim('Fade','Panel',M['panelInMs'])]
    commands['panelOut']=[anim('Reveal','Panel',M['panelOutMs'],True,'Right'),anim('Fade','Panel',M['panelOutMs'],True)]
    for group in ['headline','detail','sot']:
        delay=M['textInDelayMs' if group=='headline' else 'detailInDelayMs']
        commands[group+'FirstIn']=panel_in+[anim('Fade',target,groups[group]['inMs'],delay=delay) for target in groups[group]['texts']+groups[group]['images']]
    c=layer(r,'ControlLayer',0,0,1,1)
    text(c,'_State','0',0,0,1,1,1,color='#00000000').set('DataFlags','NoEvents')
    for command,a in commands.items():
        field=text(c,'_Cmd'+command,'0',0,0,100,2,1,color='#00000000',auto='Fixed',command=True)
        field.set('Visible','True')
        b=E.SubElement(r,'Storyboard',Type='DataChangeIn',DataName='_Cmd'+command+'.Text')
        # GT reverses builders on DataChangeIn as well as TransitionOut.
        # Command IN therefore needs Reverse=True; command OUT needs False.
        for transition in a:
            transition.set('Reverse','False' if command.endswith('Out') else 'True')
        E.SubElement(b,'Storyboard.Animations').extend(a)
    for event in ['TransitionIn','TransitionOut','DataChangeIn','DataChangeOut']:
        b=E.SubElement(r,'Storyboard',Type=event)
        E.SubElement(b,'Storyboard.Animations').append(el('Fade',Object='_State',Duration='0.01'))
    package(r,TITLE)
    extras=['Ticker','Logo']
    for kind in extras: independent(kind)
    manifest=dict(file=TITLE+'.gtzip',independentFiles=['NewsCG-'+kind+'.gtzip' for kind in extras],canvas=[1920,1080],motionMs=M,groups=groups,commands=list(commands),autosize=['Topic','Location','Brand'],differences=['GT easing replaces CSS cubic-bezier.','Text fades at source durations; the CSS 24px translation differs.','GT auto-shrink adjusts font size rather than horizontal squishing.','Clock uses Windows local time.'])
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Built 3 GT titles: full story, combined ticker, logo with LIVE: '+str(OUT))


if __name__=='__main__': main()
