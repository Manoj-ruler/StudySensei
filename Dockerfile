FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time,
# so they must be supplied as build args (docker build --build-arg ...).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CODE_RUNNER_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_CODE_RUNNER_URL=$NEXT_PUBLIC_CODE_RUNNER_URL

# Build for production
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
