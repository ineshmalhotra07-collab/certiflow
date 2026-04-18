import emailjs from '@emailjs/browser';

export const sendCertificateEmail = async (
  serviceId: string, 
  templateId: string, 
  publicKey: string, 
  toEmail: string, 
  toName: string, 
  subject: string,
  message: string,
  base64Pdf: string
) => {
  emailjs.init(publicKey);

  const templateParams = {
    to_email: toEmail,
    to_name: toName,
    subject: subject,
    message: message,
    content: base64Pdf // Often used as content variable for attachment
  };

  return emailjs.send(serviceId, templateId, templateParams);
};
