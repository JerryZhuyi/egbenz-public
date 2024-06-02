from pdfminer.layout import LAParams 
from pdfminer.pdfpage import PDFPage
from pdfminer.pdfinterp import PDFResourceManager, PDFPageInterpreter
from pdfminer.converter import TextConverter
from pdfminer.layout import LAParams
import io
import base64

def get_page_text_and_total_pages(base64_pdf, is_all=False, page_start=0, page_end=-1):
    resource_manager = PDFResourceManager()
    fake_file_handle = io.StringIO()
    converter = TextConverter(resource_manager, fake_file_handle, laparams=LAParams())
    page_interpreter = PDFPageInterpreter(resource_manager, converter)

    base64_pdf = base64_pdf.replace('data:application/pdf;base64,', '')
    pdf_bytes = base64.b64decode(base64_pdf)
    pdf_file = io.BytesIO(pdf_bytes)
    if is_all:
        page_numbers = set()  # empty set means all pages
    else:
        page_numbers = set(range(page_start, page_end + 1))  # set the range of pages you want to extract
    for page in PDFPage.get_pages(pdf_file, 
                                  page_numbers, # set the range of pages you want to extract
                                  caching=True,
                                  check_extractable=True):
        page_interpreter.process_page(page)

    text = fake_file_handle.getvalue()

    # close open handles
    converter.close()
    fake_file_handle.close()

    if text:
        return text
    
    return "PDF文件过大，无法转换"
    
    

# from PyPDF2 import PdfReader

# def get_page_text_and_total_pages(base64_pdf, is_all=False, page_start=0, page_end=-1):
#     all_text = ""
#     base64_pdf = base64_pdf.replace('data:application/pdf;base64,', '')
#     # Decode the base64 PDF
#     decoded_pdf = base64.b64decode(base64_pdf)
    
#     # Read the PDF with PyPDF2
#     pdf = PdfReader(io.BytesIO(decoded_pdf))
    
#     # Get the total number of pages
#     total_pages = len(pdf.pages)
    
#     if is_all:
#         for page in pdf.pages:
#             all_text += page.extract_text()
#         return all_text
    
#     else:
#         if page_end == -1:
#             page_end = total_pages
#         if page_start < 0:
#             page_start = 0
#         if page_end > total_pages:
#             page_end = total_pages
#         if page_end < page_start:
#             page_end = page_start+1
        
#         for i in range(page_start, page_end):
#             all_text += pdf.pages[i].extract_text()
#         return all_text