"""Verify GT packaging; --live imports titles into vMix and captures native renders.

Only the imported NewsCG inputs are animated/edited. Program/overlay/recording/
streaming controls are never changed. Live validation requires Pillow.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = Path.home() / "Documents" / "News-Vmix"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def api(base, **args):
    url = base.rstrip("/") + "/api/"
    if args:
        url += "?" + urllib.parse.urlencode(args)
    with urllib.request.urlopen(url, timeout=20) as response:
        return response.read()


def state(base):
    return ET.fromstring(api(base))


def find_input(base, title):
    return next((node for node in state(base).findall("./inputs/input") if node.attrib["title"] == title), None)


def poll(callback, message, timeout=10):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = callback()
        if value is not None and value is not False:
            return value
        time.sleep(0.1)
    raise RuntimeError(message)


def capture(base, key, path):
    # vMix SnapshotInput writes asynchronously. Wait for a complete readable PNG.
    from PIL import Image
    path.parent.mkdir(parents=True, exist_ok=True)
    old_stamp = path.stat().st_mtime_ns if path.exists() else None
    api(base, Function="SnapshotInput", Input=key, Value=str(path.resolve()))

    def load():
        if not path.exists() or path.stat().st_mtime_ns == old_stamp:
            return None
        try:
            with Image.open(path) as image:
                image.load()
                return image.convert("RGBA")
        except (OSError, ValueError):
            return None
    return poll(load, f"Snapshot gagal: {path}")


def validate_package(path):
    with zipfile.ZipFile(path) as archive:
        require(archive.testzip() is None, f"ZIP rusak: {path.name}")
        for part in ("document.xml", "resources.xml", "[Content_Types].xml"):
            require(part in archive.namelist(), f"Part hilang: {part}")
        root = ET.fromstring(archive.read("document.xml"))
        require(root.attrib == {"Width": "1920", "Height": "1080"}, "Canvas tidak 1920x1080")
        names = [node.attrib["Name"] for node in root.iter() if "Name" in node.attrib]
        require(len(names) == len(set(names)), f"Nama objek duplikat: {path.name}")
        for board in root.findall("Storyboard"):
            for animation in board.find("Storyboard.Animations"):
                require(animation.attrib["Object"] in names, f"Target animasi hilang: {animation.attrib}")
        for event in ("TransitionIn", "TransitionOut"):
            require(root.find(f"Storyboard[@Type='{event}']/Storyboard.Animations") is not None, f"Storyboard {event} hilang")
        resources = ET.fromstring(archive.read("resources.xml"))
        for source in resources.findall("./resource/source"):
            require(source.attrib["guid"] in archive.namelist(), "Asset belum dipaketkan")
        return root


def live_verify(base, paths, reload=False):
    from PIL import ImageChops
    initial=state(base)
    require(initial.findtext('streaming')=='False' and initial.findtext('recording')=='False','Verifikasi dilakukan saat tidak streaming/recording')
    program=initial.findtext('active'); preview=initial.findtext('preview')
    results=[]; keys={}
    import os, shutil
    temp=Path(os.environ['TEMP'])/'newscg-qa'; temp.mkdir(exist_ok=True)
    run_id=str(time.time_ns())
    for path in paths:
        qa=temp/('VERIFY-'+run_id+'-'+path.name)
        native=find_input(base,qa.name)
        if native is not None:
            require(not any(o.text==native.get('number') for o in initial.findall('./overlays/overlay')),'Input QA sedang di overlay')
            api(base,Function='RemoveInput',Input=native.get('key')); poll(lambda: find_input(base,qa.name) is None,'QA belum ditutup')
        shutil.copy2(path,qa)
        api(base,Function='AddInput',Value='Title|'+str(qa)); native=poll(lambda:find_input(base,qa.name),'GT belum dimuat')
        key=native.get('key'); keys[path.stem]=key
        api(base,Function='PreviewInput',Input=key); api(base,Function='Play',Input=key)
        api(base,Function='AutoPauseOff',Input=key)
        api(base,Function='LoopOn',Input=key)
        if path.stem=='NewsCG-Berita-Full': continue
        api(base,Function='TitleBeginAnimation',Input=key,Value='TransitionIn'); time.sleep(.9)
        render=capture(base,key,OUT/'previews'/(path.stem+'.png'))
        require(render.getchannel('A').getbbox() is not None,'IN kosong '+path.name)
        require(render.getpixel((0,0))[3]==0,'Latar bukan alpha')
        api(base,Function='TitleBeginAnimation',Input=key,Value='TransitionOut'); time.sleep(.7)
        empty=capture(base,key,OUT/'verification'/(path.stem+'-out.png'))
        require(empty.getchannel('A').getbbox() is None,'OUT tidak reverse / masih terlihat '+path.name)
        api(base,Function='TitleBeginAnimation',Input=key,Value='TransitionIn');time.sleep(.8)
        returned=capture(base,key,OUT/'verification'/(path.stem+'-return.png'))
        require(returned.getchannel('A').getbbox() is not None,'IN ulang gagal')
        if path.stem=='NewsCG-Ticker':
            crop=(700,1000,1500,1045); time.sleep(.5)
            later=capture(base,key,OUT/'verification/ticker-moving.png')
            require(ImageChops.difference(returned.crop(crop),later.crop(crop)).convert('RGB').getbbox() is not None,'Running text tidak bergerak')
            for value,suffix in [('TV','short'),('NAMA ACARA YANG LEBIH PANJANG','long')]:
                api(base,Function='SetText',Input=key,SelectedName='Brand.Text',Value=value);time.sleep(.2)
                picture=capture(base,key,OUT/'verification'/('brand-'+suffix+'.png'))
                red=[x for x in range(70,1400) if picture.getpixel((x,1020))[0]>150 and picture.getpixel((x,1020))[1]<50]
                require(red,'Panel merah hilang'); results.append({'brandWidth'+suffix:max(red)-min(red)+1})
            require(results[-1]['brandWidthlong']>results[-2]['brandWidthshort']+100,'Nama acara tidak autosize')
            api(base,Function='SetText',Input=key,SelectedName='Clock.Text',Value='12:34 WIB');time.sleep(.15)
            require(state(base).find("./inputs/input[@key='"+key+"']/text[@name='Clock.Text']").text=='12:34 WIB','Jam custom gagal')
        results.append({'file':path.name,'nativeGT':True,'alpha':True,'inOutIn':True})
        print('VMIX_OK '+path.name,flush=True)
    key=keys['NewsCG-Berita-Full']
    api(base,Function='PreviewInput',Input=key)
    require(not state(base).findtext("./overlays/overlay[@number='8']"),'Overlay 8 sedang dipakai')
    api(base,Function='OverlayInput8In',Input=key)
    manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
    def visible(group,on):
        g=manifest['groups'][group]
        for n in g['texts']: api(base,Function='SetTextVisible'+('On' if on else 'Off'),Input=key,SelectedName=n+'.Text')
        for n in g['images']: api(base,Function='SetImageVisible'+('On' if on else 'Off'),Input=key,SelectedName=n+'.Source')
    def command(name):
        api(base,Function='Play',Input=key)
        api(base,Function='SetText',Input=key,SelectedName='_Cmd'+name+'.Text',Value=str(time.time_ns()))
    api(base,Function='SetImageVisibleOn',Input=key,SelectedName='Panel.Source')
    visible('headline',True);command('headlineFirstIn');time.sleep(.75)
    before=capture(base,key,OUT/'verification/headline-in.png')
    command('headlineOut');time.sleep(.4)
    after=capture(base,key,OUT/'verification/headline-out.png')
    require(ImageChops.difference(before.crop((108,852,1500,922)),after.crop((108,852,1500,922))).convert('RGB').getbbox() is not None,'DataChange OUT gagal')
    command('headlineIn');time.sleep(.5)
    for group in ['topic','location','detail']:
        visible(group,True);command(group+'In');time.sleep(.5)
    detail=capture(base,key,OUT/'verification/detail-mode.png')
    command('detailOut');time.sleep(.25);visible('detail',False)
    visible('sot',True);command('sotIn');time.sleep(.45)
    sot=capture(base,key,OUT/'previews/NewsCG-Berita-Full.png')
    require(ImageChops.difference(detail.crop((108,923,1510,978)),sot.crop((108,923,1510,978))).convert('RGB').getbbox() is not None,'Narasumber tidak berubah')
    for group,field,region in [('topic','Topic',(70,780,1609,842)),('location','Location',(70,76,1470,129))]:
        widths=[]
        for value,suffix in [('A','short'),('LABEL LEBIH PANJANG','long')]:
            api(base,Function='SetText',Input=key,SelectedName=field+'.Text',Value=value);time.sleep(.2)
            picture=capture(base,key,OUT/'verification'/(group+'-'+suffix+'.png'))
            bounds=picture.crop(region).getchannel('A').getbbox();require(bounds is not None,'Label hilang');widths.append(bounds[2]-bounds[0])
        require(widths[1]>widths[0]+100,'Panel tidak autosize '+group)
        results.append({'autosize':group,'widths':widths})
    for group in ['topic','sot','headline','location']:
        command(group+'Out');time.sleep(manifest['groups'][group]['outMs']/1000+.1);visible(group,False)
    command('panelOut');time.sleep(.5)
    empty=capture(base,key,OUT/'verification/story-clear.png')
    require(empty.getchannel('A').getbbox() is None,'Panel OUT masih terlihat')
    api(base,Function='OverlayInput8Out')
    results.append({'file':'NewsCG-Berita-Full.gtzip','dataChangeAnimation':True,'independentGroups':True,'outClears':True})
    final=state(base); require(final.findtext('active')==program,'Program berubah')
    (OUT/'verification/vmix-results.json').write_text(json.dumps({'version':final.findtext('version'),'results':results,'scriptCompile':True,'exactCssAnimation':False},indent=2)+'\n')
    api(base,Function='PreviewInput',Input=preview)
    print('VMIX_ALL_OK',flush=True)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--live',action='store_true');parser.add_argument('--reload',action='store_true');parser.add_argument('--api',default='http://127.0.0.1:8088');args=parser.parse_args()
    paths=sorted(OUT.glob('*.gtzip'));require(len(paths)==3,'Harus tepat 3 template')
    for path in paths: validate_package(path)
    print('PACKAGE_OK 3 titles',flush=True)
    if args.live: live_verify(args.api,paths,args.reload)


if __name__=='__main__':main()
