"""Build a preset containing only exported graphics, local scripts and shortcuts."""
import copy
import json
import os
import uuid
from pathlib import Path
from xml.etree import ElementTree as E

OUT=Path.home()/'Documents'/'News-Vmix'


def main():
    raw=E.parse(Path(os.environ['TEMP'])/'newscg-current.vmix').getroot()
    r=E.Element('XML')
    r.append(copy.deepcopy(raw.find('Version')))
    # Only graphics and a neutral black background; no capture/stream credentials.
    bg=next(n for n in raw.findall('Input') if n.get('OriginalTitle')=='Colour')
    r.append(copy.deepcopy(bg))
    titles=['Berita-Full','Ticker','Logo']
    for title in titles:
        filename='NewsCG-'+title+'.gtzip'
        n=copy.deepcopy(next(n for n in raw.findall('Input') if n.get('OriginalTitle')==filename))
        n.set('State','1')
        r.append(n)
    E.SubElement(r,'State',Main='0',Preview='1')
    overlay=E.SubElement(r,'OverlaySettings')
    for i in range(1,9):
        for tag,value in [('Input','00000000-0000-0000-0000-000000000000'),('DisplayDuration','0'),('CutPoint','0'),('Effect','100'),('Mode','0')]:
            E.SubElement(overlay,tag+str(i)).text=value
    shortcuts=E.SubElement(E.SubElement(r,'Shortcuts'),'ArrayOfShortcut')
    schema=E.fromstring((OUT/'source/shortcut-schema.xml').read_text(encoding='utf-8-sig').split('?>',1)[1])
    for binding in json.loads((OUT/'source/bindings.json').read_text()):
        n=copy.deepcopy(schema)
        n.find('ID').text=str(uuid.uuid5(uuid.NAMESPACE_URL,'newscg/'+binding['name']))
        n.find('Title').text=binding['title']
        n.find('Value').text=binding['name']
        n.find('ExpandedKey').text=binding['key']
        shortcuts.append(n)
    E.SubElement(r,'Scripting').append(E.parse(OUT/'source/scripts.xml').getroot())
    # Preserve native empty container schemas needed by the preset loader.
    for tag in ['ZoomManager','AudioMaster','AudioMatrixPresets','CategorySettings','DataSources','Activators','Alerts','DynamicSettings','ProductionClockSettings','ProductionClockSettings2','ProductionClocksInverted','MultiViewSettings','MultiViewLayout','MultiViewSettings2','MultiViewLayout2','SafeAreas','WaveformPreview','WaveformInput']:
        if raw.find(tag) is not None: r.append(copy.deepcopy(raw.find(tag)))
    E.SubElement(r,'OutputFormat',OutputSize='1920x1080',OutputFrameRate='333667',OutputFrameRateInterlaced='False',FullscreenEnabled='False',NDIOutputExternal='False',NDIOutputExternal2='False',NDIOutputExternal3='False',NDIOutputExternal4='False')
    E.indent(r,space='  ')
    E.ElementTree(r).write(OUT/'NewsCG.vmix',encoding='utf-8',xml_declaration=True)
    print('PRESET_BUILT '+str(OUT/'NewsCG.vmix'))


if __name__=='__main__': main()
