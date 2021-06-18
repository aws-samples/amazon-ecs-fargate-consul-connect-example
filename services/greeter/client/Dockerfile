FROM public.ecr.aws/hashicorp/consul:1.9.1
ADD init.sh /test/init.sh
RUN chmod +x /test/init.sh
ENTRYPOINT ["/test/init.sh"]
