import os
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from barely_core.models.domain import RunResult

class PDFReporter:
    """
    Generates professional PDF test execution reports.
    """
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self.title_style = self.styles['Heading1']
        self.h2_style = self.styles['Heading2']
        self.normal_style = self.styles['Normal']
        
        # Custom styles for success/fail
        self.success_style = ParagraphStyle('Success', parent=self.normal_style, textColor='green')
        self.fail_style = ParagraphStyle('Fail', parent=self.normal_style, textColor='red')

    def generate(self, result: RunResult, output_path: str):
        """Creates a PDF report at the specified output path."""
        doc = SimpleDocTemplate(output_path, pagesize=letter)
        story = []

        # Title
        story.append(Paragraph(f"Test Execution Report: {result.goal_name}", self.title_style))
        story.append(Spacer(1, 12))
        
        # Status
        status_text = "PASSED" if result.success else f"FAILED: {result.failure_reason}"
        style = self.success_style if result.success else self.fail_style
        story.append(Paragraph(f"Status: {status_text}", style))
        story.append(Spacer(1, 24))

        # Execution Steps
        story.append(Paragraph("Execution Audit Trail", self.h2_style))
        story.append(Spacer(1, 12))

        for idx, step in enumerate(result.rich_history, 1):
            story.append(Paragraph(f"Step {idx}: {step.description}", self.normal_style))
            story.append(Spacer(1, 6))
            
            if step.screenshot_path and os.path.exists(step.screenshot_path):
                try:
                    # Constrain image size for the PDF
                    img = Image(step.screenshot_path, width=400, height=250)
                    story.append(img)
                except Exception as e:
                    story.append(Paragraph(f"[Image rendering failed: {e}]", self.fail_style))
            
            story.append(Spacer(1, 24))

        doc.build(story)
        return output_path
