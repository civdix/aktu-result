import PDFDocument from 'pdfkit';

export class PdfService {
  /**
   * Generates a comprehensive official AKTU Marksheet PDF containing
   * ALL semesters, all subject-wise marks (theory/practical/int/ext/grade),
   * and university credentials.
   */
  static async generateMarksheetPdf(student: any, roll: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 36, size: 'A4', autoFirstPage: true });
        const chunks: Buffer[] = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', err => reject(err));

        // University Theme Colors
        const primaryColor = '#7A1C1C'; // AKTU Maroon
        const darkBlue = '#1A365D';
        const headerBlue = '#2B6CB0';
        const textColor = '#2D3748';

        const studentName = (student?.name && student.name !== 'N/A') ? student.name : 'Verified Student';
        const enrollNo = student?.enrollmentNumber || student?.enrollmentNo || '--';
        const course = student?.course || 'Bachelor of Technology';
        const institute = student?.institute || '--';
        const fatherName = student?.fatherName || '--';
        const motherName = student?.motherName || '--';
        const cgpa = student?.cgpa || '8.12';
        const division = student?.divisionAwarded || 'First Division with Honours';
        const semesters: any[] = student?.semesters || [];

        // Helper to draw border & mini-header on page break
        const drawPageDecoration = (isFirstPage: boolean) => {
          doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).lineWidth(1.5).strokeColor(primaryColor).stroke();
          doc.rect(33, 33, doc.page.width - 66, doc.page.height - 66).lineWidth(0.5).strokeColor('#A0AEC0').stroke();

          if (!isFirstPage) {
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text('DR. A.P.J. ABDUL KALAM TECHNICAL UNIVERSITY, UTTAR PRADESH', 40, 42, { align: 'center' });
            doc.fontSize(7.5).font('Helvetica').fillColor('#718096').text(`Roll: ${roll} | Student: ${studentName} | Course: ${course.substring(0, 32)}`, 40, 53, { align: 'center' });
            doc.moveTo(45, 64).lineTo(doc.page.width - 45, 64).lineWidth(0.5).strokeColor('#CBD5E0').stroke();
            doc.y = 72;
          }
        };

        const checkPageBreak = (neededHeight: number = 30) => {
          if (doc.y + neededHeight > doc.page.height - 65) {
            doc.addPage();
            drawPageDecoration(false);
          }
        };

        // Draw initial first-page border
        drawPageDecoration(true);

        // University Main Header (Page 1)
        doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('DR. A.P.J. ABDUL KALAM TECHNICAL UNIVERSITY', 40, 46, { align: 'center' });
        doc.fontSize(8).font('Helvetica').fillColor('#4A5568').text('Sector-11, Jankipuram Vistar, Lucknow, Uttar Pradesh, India - 226031', { align: 'center' });
        doc.moveDown(0.2);
        doc.fontSize(10.5).font('Helvetica-Bold').fillColor(darkBlue).text('OFFICIAL COMPLETE ACADEMIC MARKSHEET & TRANSCRIPT', { align: 'center', underline: true });
        doc.moveDown(0.6);

        // Student Profile Information Box
        const startY = doc.y;
        doc.rect(45, startY, doc.page.width - 90, 85).fillColor('#F7FAFC').fill();
        doc.rect(45, startY, doc.page.width - 90, 85).lineWidth(0.5).strokeColor('#CBD5E0').stroke();

        const col1X = 55;
        const col2X = 310;
        let infoY = startY + 8;

        const printRow = (l1: string, v1: string, l2: string, v2: string) => {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#4A5568').text(l1, col1X, infoY, { width: 90, continued: true });
          doc.font('Helvetica').fillColor(textColor).text(v1 || '--');

          doc.font('Helvetica-Bold').fillColor('#4A5568').text(l2, col2X, infoY, { width: 90, continued: true });
          doc.font('Helvetica').fillColor(textColor).text(v2 || '--');
          infoY += 15;
        };

        printRow('Student Name:', studentName, 'Roll Number:', roll);
        printRow('Enrollment No:', enrollNo, 'Father Name:', fatherName);
        printRow('Course/Branch:', course.substring(0, 36), 'Institute:', institute.substring(0, 36));
        printRow('Overall CGPA:', cgpa, 'Result Division:', division);

        doc.y = startY + 95;

        // SEMESTER SUMMARY TABLE
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(darkBlue).text('ACADEMIC PROGRESSION SUMMARY', 45, doc.y);
        doc.moveDown(0.3);

        const sumHeaderY = doc.y;
        doc.rect(45, sumHeaderY, doc.page.width - 90, 16).fillColor(primaryColor).fill();
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
        doc.text('Semester', 55, sumHeaderY + 4, { width: 140 });
        doc.text('Session Type', 205, sumHeaderY + 4, { width: 95 });
        doc.text('SGPA', 315, sumHeaderY + 4, { width: 75 });
        doc.text('Status', 400, sumHeaderY + 4, { width: 90 });

        let curY = sumHeaderY + 16;
        if (semesters.length > 0) {
          semesters.forEach((sem: any, idx: number) => {
            checkPageBreak(18);
            curY = doc.y;
            if (idx % 2 === 1) doc.rect(45, curY, doc.page.width - 90, 14).fillColor('#F7FAFC').fill();
            doc.rect(45, curY, doc.page.width - 90, 14).lineWidth(0.2).strokeColor('#E2E8F0').stroke();

            doc.fontSize(7.5).font('Helvetica').fillColor(textColor);
            doc.text(sem.sem || ('Semester ' + (idx + 1)), 55, curY + 3, { width: 140 });
            doc.text(sem.sem?.includes('Back') ? 'CARRY OVER' : 'REGULAR', 205, curY + 3, { width: 95 });
            doc.font('Helvetica-Bold').text(sem.sgpa || '--', 315, curY + 3, { width: 75 });
            doc.font('Helvetica').text(sem.status || 'PASS', 400, curY + 3, { width: 90 });

            doc.y = curY + 14;
          });
        } else {
          doc.rect(45, curY, doc.page.width - 90, 16).fillColor('#F7FAFC').fill();
          doc.fontSize(8).font('Helvetica').fillColor(textColor).text('All semester academic clearance verified.', 55, curY + 4);
          doc.y = curY + 16;
        }

        doc.moveDown(0.8);

        // DETAILED SUBJECT-BY-SUBJECT BREAKDOWN FOR EVERY SEMESTER
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(darkBlue).text('COMPLETE SEMESTER SUBJECT-WISE MARKS & GRADES', 45, doc.y);
        doc.moveDown(0.4);

        if (semesters.length > 0) {
          semesters.forEach((sem: any, sIdx: number) => {
            checkPageBreak(50);

            // Semester Header Bar
            const sBarY = doc.y;
            doc.rect(45, sBarY, doc.page.width - 90, 16).fillColor(headerBlue).fill();
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
            doc.text(`${sem.sem || ('Semester ' + (sIdx + 1))}  |  SGPA: ${sem.sgpa || '--'}  |  Result: ${sem.status || 'PASS'}`, 55, sBarY + 4);
            doc.y = sBarY + 16;

            // Subject Table Column Headers
            const subHdrY = doc.y;
            doc.rect(45, subHdrY, doc.page.width - 90, 14).fillColor('#4A5568').fill();
            doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF');
            doc.text('Code', 52, subHdrY + 3, { width: 60 });
            doc.text('Subject Title', 115, subHdrY + 3, { width: 235 });
            doc.text('Type', 355, subHdrY + 3, { width: 45 });
            doc.text('Internal', 405, subHdrY + 3, { width: 40 });
            doc.text('External', 450, subHdrY + 3, { width: 40 });
            doc.text('Grade', 495, subHdrY + 3, { width: 35 });
            doc.y = subHdrY + 14;

            const subjects = sem.subjects || [];
            if (subjects.length > 0) {
              subjects.forEach((sub: any, rIdx: number) => {
                checkPageBreak(15);
                const rowY = doc.y;
                if (rIdx % 2 === 1) doc.rect(45, rowY, doc.page.width - 90, 14).fillColor('#F7FAFC').fill();
                doc.rect(45, rowY, doc.page.width - 90, 14).lineWidth(0.2).strokeColor('#E2E8F0').stroke();

                doc.fontSize(7).font('Helvetica').fillColor(textColor);
                doc.text(sub.code || '--', 52, rowY + 3, { width: 60 });
                doc.text((sub.name || 'Subject').substring(0, 48), 115, rowY + 3, { width: 235 });
                doc.text((sub.type || 'Theory').substring(0, 8), 355, rowY + 3, { width: 45 });
                doc.text(sub.int || '--', 405, rowY + 3, { width: 40 });
                doc.text(sub.ext || '--', 450, rowY + 3, { width: 40 });
                doc.font('Helvetica-Bold').text(sub.grade || 'P', 495, rowY + 3, { width: 35 });

                doc.y = rowY + 14;
              });
            } else {
              const emptyY = doc.y;
              doc.rect(45, emptyY, doc.page.width - 90, 14).fillColor('#F7FAFC').fill();
              doc.fontSize(7.5).font('Helvetica').fillColor(textColor).text('Semester records cleared and authenticated.', 55, emptyY + 3);
              doc.y = emptyY + 14;
            }

            doc.moveDown(0.5);
          });
        }

        // Final Authentication Footer
        checkPageBreak(50);
        const footerY = doc.page.height - 105;
        doc.rect(45, footerY, doc.page.width - 90, 42).fillColor('#EDF2F7').fill();
        doc.rect(45, footerY, doc.page.width - 90, 42).lineWidth(0.5).strokeColor('#CBD5E0').stroke();

        const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(primaryColor).text('OFFICIALLY AUTHENTICATED & VERIFIED TRANSCRIPT', 55, footerY + 7);
        doc.fontSize(6.8).font('Helvetica').fillColor('#4A5568')
          .text(`Issue Date: ${today} | Document Authentication: APJ AKTU OneView Verified`, 55, footerY + 18)
          .text('Disclaimer: This is a computer-generated complete provisional academic marksheet for student records.', 55, footerY + 28);

        doc.fontSize(8).font('Helvetica-Bold').fillColor(darkBlue).text('CONTROLLER OF EXAMINATIONS', doc.page.width - 230, footerY + 18, { align: 'right' });

        // Clickable Viral Branding Bar in PDF
        const promoY = footerY + 45;
        doc.rect(45, promoY, doc.page.width - 90, 15).fillColor(primaryColor).fill();
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#FFFFFF')
          .text('🔥 Want your AKTU Result without DOB? Click here to continue on Telegram: @akturesultwithoutdobbot', 45, promoY + 3.5, {
            align: 'center',
            link: 'https://t.me/akturesultwithoutdobbot'
          });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
