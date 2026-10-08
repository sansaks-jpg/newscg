"""Generate native vMix VB.NET scripts for the single full-story GT input."""
import json
from pathlib import Path
from xml.etree import ElementTree as E

OUT=Path.home()/'Documents'/'News-Vmix'
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
groups=manifest['groups']


def vb_array(values):
    return 'New String() {'+', '.join('"'+v.replace('"','""')+'"' for v in values)+'}'


def script_code(action_groups, turn_on):
    # A shared lock serialises cue actions; repeated IN/OUT is idempotent.
    lines=[
        'SyncLock GetType(System.String)',
        'Dim doc As New System.Xml.XmlDocument()',
        'doc.LoadXml(API.XML())',
        'Dim target As System.Xml.XmlNode = Nothing',
        'For Each node As System.Xml.XmlNode In doc.SelectNodes("/vmix/inputs/input")',
        '    If node.Attributes("title").Value = "NewsCG-Berita-Full.gtzip" Then target = node',
        'Next',
        'If target Is Nothing Then Throw New System.Exception("Input NewsCG-Berita-Full.gtzip belum dimuat.")',
        'Dim key As String = target.Attributes("key").Value',
        'Dim mask As Integer = 0',
        'Dim stateNode As System.Xml.XmlNode = target.SelectSingleNode("text[@name=\'_State.Text\']")',
        'If stateNode IsNot Nothing Then Integer.TryParse(stateNode.InnerText, mask)',
        'Dim overlay As System.Xml.XmlNode = doc.SelectSingleNode("/vmix/overlays/overlay[@number=\'1\']")',
        'If overlay IsNot Nothing AndAlso overlay.InnerText <> "" AndAlso overlay.InnerText <> target.Attributes("number").Value Then Throw New System.Exception("Overlay 1 sedang dipakai input lain.")',
        'If overlay IsNot Nothing AndAlso overlay.InnerText = "" Then API.Function("OverlayInput1In", Input:=key)',
        'API.Function("Play", Input:=key)',
        'For Each groupName As String In '+vb_array(action_groups),
        '    Dim bit As Integer = 0',
        '    Dim duration As Integer = 0',
        '    Dim textFields As String() = New String() {}',
        '    Dim imageFields As String() = New String() {}',
        '    Select Case groupName',
    ]
    for name,g in groups.items():
        lines += ['        Case "'+name+'"', '            bit = '+str(g['bit']), '            duration = '+str(g['inMs' if turn_on else 'outMs']), '            textFields = '+vb_array([n+'.Text' for n in g['texts']]), '            imageFields = '+vb_array([n+'.Source' for n in g['images']])]
    lines+=['    End Select']
    # Detail and SOT occupy the same row; changing mode clears the previous row first.
    if turn_on:
        lines += ['    Dim conflict As Integer = If(groupName = "sot", 4, If(groupName = "detail", 16, 0))',
                  '    If conflict <> 0 AndAlso (mask And conflict) <> 0 Then',
                  '        Dim conflictName As String = If(conflict = 4, "detail", "sot")',
                  '        API.Function("SetText", Input:=key, SelectedName:="_Cmd" & conflictName & "Out.Text", Value:=System.DateTime.UtcNow.Ticks.ToString())',
                  '        Sleep(210)',
                  '        If conflict = 4 Then',
                  '            API.Function("SetTextVisibleOff", Input:=key, SelectedName:="Detail.Text")',
                  '        Else',
                  '            API.Function("SetTextVisibleOff", Input:=key, SelectedName:="Name.Text")',
                  '            API.Function("SetTextVisibleOff", Input:=key, SelectedName:="Role.Text")',
                  '            API.Function("SetImageVisibleOff", Input:=key, SelectedName:="Divider.Source")',
                  '        End If',
                  '        mask = mask And (Not conflict)',
                  '    End If',
                  '    If (mask And bit) = 0 Then',
                  '        Dim firstPanel As Boolean = ((bit And 21) <> 0 AndAlso (mask And 21) = 0)',
                  '        For Each field As String In textFields',
                  '            API.Function("SetTextVisibleOn", Input:=key, SelectedName:=field)',
                  '        Next',
                  '        For Each field As String In imageFields',
                  '            API.Function("SetImageVisibleOn", Input:=key, SelectedName:=field)',
                  '        Next',
                  '        Dim command As String = groupName & "In"',
                  '        If firstPanel Then',
                  '            API.Function("SetImageVisibleOn", Input:=key, SelectedName:="Panel.Source")',
                  '            command = groupName & "FirstIn"',
                  '            duration = 600',
                  '        End If',
                  '        API.Function("SetText", Input:=key, SelectedName:="_Cmd" & command & ".Text", Value:=System.DateTime.UtcNow.Ticks.ToString())',
                  '        Sleep(duration + 40)',
                  '        mask = mask Or bit',
                  '    End If']
    else:
        lines += ['    If (mask And bit) <> 0 Then',
                  '        API.Function("SetText", Input:=key, SelectedName:="_Cmd" & groupName & "Out.Text", Value:=System.DateTime.UtcNow.Ticks.ToString())',
                  '        Sleep(duration + 40)',
                  '        For Each field As String In textFields',
                  '            API.Function("SetTextVisibleOff", Input:=key, SelectedName:=field)',
                  '        Next',
                  '        For Each field As String In imageFields',
                  '            API.Function("SetImageVisibleOff", Input:=key, SelectedName:=field)',
                  '        Next',
                  '        mask = mask And (Not bit)',
                  '        If (bit And 21) <> 0 AndAlso (mask And 21) = 0 Then',
                  '            API.Function("SetText", Input:=key, SelectedName:="_CmdpanelOut.Text", Value:=System.DateTime.UtcNow.Ticks.ToString())',
                  '            Sleep(400)',
                  '            API.Function("SetImageVisibleOff", Input:=key, SelectedName:="Panel.Source")',
                  '        End If',
                  '    End If']
    lines += ['    API.Function("SetText", Input:=key, SelectedName:="_State.Text", Value:=mask.ToString())', 'Next']
    if action_groups==['topic','detail','sot','headline','location'] and not turn_on:
        lines += ['API.Function("OverlayInput1Out")']
    lines += ['End SyncLock']
    return '\n'.join(lines)+'\n'


def main():
    scripts=E.Element('ArrayOfScript'); bindings=[]
    jobs=[('Headline_IN',['headline'],True,'F1'),('Headline_OUT',['topic','headline'],False,'F2'),
          ('Topic_IN',['topic'],True,'F3'),('Topic_OUT',['topic'],False,'F4'),
          ('Detail_IN',['detail'],True,'F5'),('Detail_OUT',['detail'],False,'F6'),
          ('Location_IN',['location'],True,'F7'),('Location_OUT',['location'],False,'F8'),
          ('SOT_IN',['sot'],True,'F9'),('SOT_OUT',['sot'],False,'F10'),
          ('Headline_Topic_IN',['headline','topic'],True,'F11'),
          ('Clear_All',['topic','detail','sot','headline','location'],False,'F12')]
    for suffix,names,on,key in jobs:
        name='NCG_'+suffix; code=script_code(names,on)
        (OUT/'controls'/(name+'.vb')).write_text(code,encoding='utf-8')
        script=E.SubElement(scripts,'Script'); E.SubElement(script,'Code').text=code; E.SubElement(script,'Name').text=name
        bindings.append(dict(name=name,key=key,title=suffix.replace('_',' ')))
    E.indent(scripts,space='  ')
    (OUT/'source'/'scripts.xml').write_bytes(E.tostring(scripts,encoding='utf-8',xml_declaration=True))
    (OUT/'source'/'bindings.json').write_text(json.dumps(bindings,indent=2)+'\n',encoding='utf-8')
    print('Built 12 native vMix control scripts')


if __name__=='__main__': main()
