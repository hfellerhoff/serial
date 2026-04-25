import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from "@react-email/components";

interface VerifyEmailChangeProps {
  verificationUrl?: string;
  supportEmail?: string;
}

const baseUrl = `https://serial.tube`;

export default function VerifyEmailChangeEmail({
  verificationUrl,
  supportEmail,
}: VerifyEmailChangeProps) {
  return (
    <Html>
      <Head />
      <Preview>Verify your new email address for Serial</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Verify your new email</Heading>
          <Text style={text}>
            You requested to change your email address. Click the link below to
            confirm your new email:
          </Text>
          <Link
            href={verificationUrl}
            target="_blank"
            style={{
              ...link,
              display: "block",
              marginBottom: "16px",
            }}
          >
            Click here to verify your new email
          </Link>
          <Text
            style={{
              ...text,
              color: "#ababab",
              marginTop: "14px",
              marginBottom: "16px",
            }}
          >
            If you didn&apos;t request this change, you can safely ignore this
            email.
          </Text>

          <Img
            style={{
              marginTop: 32,
            }}
            src={`${baseUrl}/icon-256.png`}
            width="48"
            height="48"
            alt="Serial's Logo"
          />
          {supportEmail && (
            <Text
              style={{
                ...text,
                color: "#666",
                marginTop: "14px",
                marginBottom: "16px",
              }}
            >
              Having trouble? Reach out to us at{" "}
              <Link
                style={{
                  textDecoration: "underline",
                }}
                href={`mailto:${supportEmail}`}
              >
                {supportEmail}
              </Link>
            </Text>
          )}
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#ffffff",
};

const container = {
  paddingLeft: "12px",
  paddingRight: "12px",
  margin: "0 auto",
} as const;

const h1 = {
  color: "#333",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "24px",
  fontWeight: "bold",
  marginTop: "40px",
  marginBottom: "20px",
  padding: "0",
};

const link = {
  color: "#2754C5",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "14px",
  textDecoration: "underline",
};

const text = {
  color: "#333",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "14px",
  margin: "24px 0",
};
