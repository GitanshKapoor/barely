import os
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from barely_core.models.domain import RunResult

def clean_action_description(desc: str, thought: str = None) -> str:
    import re
    if not desc:
        return "Action executed"
    cleaned = re.sub(r'\[barely-id=["\']?[^"\']+["\']?\]', 'element', desc)
    if re.search(r'clicked\s+(?:element\s+)?\[\d+\]', cleaned, re.I):
        if thought:
            m = re.search(r'click(?:ing|ed)?\s+(?:on\s+)?(?:the\s+)?([^.,;]+)', thought, re.I)
            if m and len(m.group(1).strip()) < 35:
                return f'Clicked "{m.group(1).strip()}"'
        return "Clicked target element"
    if re.search(r'typed\s+.*?\s+into\s+(?:element\s+)?\[\d+\]', cleaned, re.I):
        tm = re.search(r"typed\s+'([^']*)'", cleaned, re.I)
        txt = tm.group(1) if tm else ''
        if thought:
            im = re.search(r'(?:type|enter|input)(?:ing)?\s+.*?into\s+(?:the\s+)?([^.,;]+)', thought, re.I)
            if im and len(im.group(1).strip()) < 35:
                return f'Typed \'{txt}\' into "{im.group(1).strip()}" field'
        return f"Typed '{txt}' into input field" if txt else "Entered text into input field"
    cleaned = re.sub(r'\s*\[\d+\]', '', cleaned)
    return cleaned

class PDFReporter:
    """
    Generates professional PDF test execution reports.
    """
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self.title_style = self.styles['Heading1']
        self.h2_style = self.styles['Heading2']
        self.normal_style = self.styles['Normal']
        
        # Custom styles
        self.success_style = ParagraphStyle('Success', parent=self.normal_style, textColor='#10b981', fontName='Helvetica-Bold')
        self.fail_style = ParagraphStyle('Fail', parent=self.normal_style, textColor='#f43f5e', fontName='Helvetica-Bold')
        self.step_header_style = ParagraphStyle('StepHeader', parent=self.h2_style, fontSize=12, leading=16, textColor='#0278ff')
        self.thought_style = ParagraphStyle('Thought', parent=self.normal_style, fontSize=9, leading=13, textColor='#475569')
        self.action_style = ParagraphStyle('Action', parent=self.normal_style, fontSize=10, leading=14, fontName='Helvetica-Bold', textColor='#0f172a')

    def generate(self, result: RunResult, output_path: str):
        """Creates a professional PDF report at the specified output path."""
        import base64
        import tempfile
        doc = SimpleDocTemplate(output_path, pagesize=letter)
        story = []

        # Title
        story.append(Paragraph(f"Test Execution Report: {result.goal_name}", self.title_style))
        story.append(Spacer(1, 10))
        
        # Status
        status_text = "PASSED" if result.success else f"FAILED: {result.failure_reason}"
        style = self.success_style if result.success else self.fail_style
        story.append(Paragraph(f"Status: {status_text}", style))
        story.append(Spacer(1, 18))

        # Execution Steps
        story.append(Paragraph("Execution Audit Trail", self.h2_style))
        story.append(Spacer(1, 10))

        temp_files = []
        try:
            for idx, step in enumerate(result.rich_history, 1):
                story.append(Paragraph(f"Step {idx}", self.step_header_style))
                story.append(Spacer(1, 4))
                
                # Thought
                thought = getattr(step, "thought", None)
                if thought:
                    story.append(Paragraph(f"<b>AI Agent Reasoning:</b> <i>\"{thought}\"</i>", self.thought_style))
                    story.append(Spacer(1, 4))
                
                # Action
                raw_desc = getattr(step, "description", str(step))
                desc = clean_action_description(raw_desc, thought)
                story.append(Paragraph(f"<b>Action Executed:</b> {desc}", self.action_style))
                story.append(Spacer(1, 8))
                
                # Screenshot (from path or base64)
                img_path = getattr(step, "screenshot_path", None)
                b64_snap = getattr(step, "screenshot_base64", None)
                
                if not img_path and b64_snap:
                    try:
                        tf = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
                        tf.write(base64.b64decode(b64_snap))
                        tf.flush()
                        tf.close()
                        temp_files.append(tf.name)
                        img_path = tf.name
                    except Exception:
                        img_path = None
                
                if img_path and os.path.exists(img_path):
                    try:
                        img = Image(img_path, width=400, height=220)
                        story.append(img)
                    except Exception as e:
                        story.append(Paragraph(f"[Image rendering failed: {e}]", self.fail_style))
                
                story.append(Spacer(1, 16))

            doc.build(story)
        finally:
            for tf_name in temp_files:
                try:
                    os.remove(tf_name)
                except OSError:
                    pass

        return output_path
